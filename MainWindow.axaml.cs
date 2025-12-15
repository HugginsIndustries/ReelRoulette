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
    public enum VolumeNormalizationMode
    {
        Off = 0,
        Simple = 1,
        LibraryAware = 2,
        Advanced = 3
    }

    public enum AudioFilterMode
    {
        PlayAll = 0,           // Default: no audio filtering
        WithAudioOnly = 1,      // Only videos with audio
        WithoutAudioOnly = 2    // Only videos without audio
    }

    public partial class MainWindow : Window, INotifyPropertyChanged
    {
        private readonly string[] _videoExtensions =
        {
            ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".mpg", ".mpeg"
        };

        private readonly Random _rng = new();
        private System.Timers.Timer? _autoPlayTimer;
        private bool _isKeepPlayingActive = false;

        // LibVLC components
        private LibVLC? _libVLC;
        private MediaPlayer? _mediaPlayer;
        private Media? _currentMedia;


        // Volume normalization constants
        private const double TargetLoudnessDb = -16.0;  // Target mean volume in dB (improved from -18.0)
        private const double MaxGainDb = 20.0;          // Maximum gain adjustment in dB (improved from 12.0)
        private const double MaxOutputPeakDb = -3.0;    // Limiter: prevent peak output from exceeding this (prevents clipping)

        // Volume normalization
        private VolumeNormalizationMode _volumeNormalizationMode = VolumeNormalizationMode.Off;
        private int _userVolumePreference = 100; // User's slider preference (0-200)
        private AudioFilterMode _audioFilterMode = AudioFilterMode.PlayAll;

        // Queue system
        private Queue<string> _playQueue = new();
        private bool _noRepeatMode = true;

        // Current video tracking
        private string? _currentVideoPath;
        // Store the previous LastPlayedUtc for the current video (before current play) for display purposes
        private DateTime? _previousLastPlayedUtc;
        private bool _isLoopEnabled = true;
        private bool _autoPlayNext = true;

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
        
        // FFmpeg logging
        private readonly List<FFmpegLogEntry> _ffmpegLogs = new();
        private readonly object _ffmpegLogsLock = new object();
        private Window? _ffmpegLogWindow;

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

        // Library panel state
        private ObservableCollection<LibraryItem> _libraryItems = new ObservableCollection<LibraryItem>();
        private string? _currentViewPreset = null; // null = All videos, or "Favorites", "Blacklisted", "RecentlyPlayed", "NeverPlayed"
        private string? _selectedSourceId = null; // null = All sources
        private string _librarySearchText = "";
        private string _librarySortMode = "Name"; // "Name", "LastPlayed", "PlayCount", "Duration"
        
        // Debouncing for UpdateLibraryPanel
        private CancellationTokenSource? _updateLibraryPanelCancellationSource;
        private DispatcherTimer? _updateLibraryPanelDebounceTimer;
        private readonly object _updateLibraryPanelLock = new object();
        private bool _isInitializingLibraryPanel = false; // Flag to suppress events during initialization
        private bool _isUpdatingLibraryItems = false; // Flag to suppress Favorite/Blacklist events during UI updates

        // Aspect ratio tracking
        private double _currentVideoAspectRatio = 16.0 / 9.0; // Default 16:9
        private bool _hasValidAspectRatio = false;
        
        // Window size adjustment for aspect ratio locking
        private bool _isAdjustingSize = false;
        private Size _lastWindowSize;


        // Global stats backing fields
        private int _globalTotalPlays;
        private int _globalUniqueVideosPlayed;
        private int _globalTotalVideosKnown;
        private int _globalNeverPlayedKnown;
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

        public int GlobalNeverPlayedKnown
        {
            get => _globalNeverPlayedKnown;
            private set
            {
                if (_globalNeverPlayedKnown != value)
                {
                    _globalNeverPlayedKnown = value;
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

        private string _libraryInfoText = "🎞️ 0 videos · 🎯 0 selected";

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
            this.Loaded += (s, e) =>
            {
                try
                {
                    Log("MainWindow Loaded event: Fired!");
                    Log("MainWindow Loaded event: Initializing Library panel...");
                    InitializeLibraryPanel();
                    Log("MainWindow Loaded event: Library panel initialized successfully.");
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
            UpdateCurrentVideoStatsUi();
            
            // Set DataContext for bindings (after all initialization)
            DataContext = this;
            
            // Initialize volume
            if (_mediaPlayer != null)
            {
                _mediaPlayer.Volume = 100;
                VolumeSlider.Value = 100;
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

            // Clean up the timer
            if (_autoPlayTimer != null)
            {
                _autoPlayTimer.Stop();
                _autoPlayTimer.Dispose();
                _autoPlayTimer = null;
            }

            base.OnClosed(e);
        }

        private void MediaPlayer_EndReached(object? sender, EventArgs e)
        {
            Log($"MediaPlayer_EndReached: Video playback ended - CurrentVideoPath: {_currentVideoPath ?? "null"}");
            // Hand off end-of-media work asynchronously so UI thread stays responsive
            _ = HandleEndReachedAsync();
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
                    Log("HandleEndReachedAsync: Auto-play next enabled - playing random video");
                    // If loop is off, honor autoplay to move to the next random selection
                    await Dispatcher.UIThread.InvokeAsync(() => PlayRandomVideo());
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
                    Log($"HandleEndReachedAsync: ERROR - Inner exception: {ex.InnerException.Message}");
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
            UpdateCurrentVideoStatsUi();
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
            // Call UpdateCurrentVideoStatsUi first to show current video, then recalculate globals
            Log("RecordPlayback: Updating UI stats");
            UpdateCurrentVideoStatsUi();
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
                GlobalTotalVideosKnown = _libraryIndex.Items.Count;
                GlobalFavoritesCount = _libraryIndex.Items.Count(i => i.IsFavorite);
                GlobalBlacklistCount = _libraryIndex.Items.Count(i => i.IsBlacklisted);
                Log($"RecalculateGlobalStats: Library stats - Total: {GlobalTotalVideosKnown}, Favorites: {GlobalFavoritesCount}, Blacklisted: {GlobalBlacklistCount}");
            }
            else
            {
                GlobalTotalVideosKnown = knownVideos.Count;
                GlobalFavoritesCount = 0;
                GlobalBlacklistCount = 0;
                Log($"RecalculateGlobalStats: No library index, using known videos count: {GlobalTotalVideosKnown}");
            }

            // Calculate stats from library items
            int uniquePlayed = 0;
            int totalPlays = 0;
            int videosWithAudio = 0;
            int videosWithoutAudio = 0;

            if (_libraryIndex != null)
            {
                foreach (var item in _libraryIndex.Items)
                {
                    if (item.PlayCount > 0)
                    {
                        uniquePlayed++;
                        totalPlays += item.PlayCount;
                    }
                    
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

            GlobalUniqueVideosPlayed = uniquePlayed;
            GlobalTotalPlays = totalPlays;
            GlobalNeverPlayedKnown = Math.Max(0, GlobalTotalVideosKnown - GlobalUniqueVideosPlayed);
            GlobalVideosWithAudio = videosWithAudio;
            GlobalVideosWithoutAudio = videosWithoutAudio;
            
            Log($"RecalculateGlobalStats: Playback stats - Unique played: {GlobalUniqueVideosPlayed}, Total plays: {GlobalTotalPlays}, Never played: {GlobalNeverPlayedKnown}");
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
                LibraryInfoText = "Library · 🎞️ 0 videos · 🎯 0 selected";
                return;
            }

            int totalVideos = _libraryIndex.Items.Count;

            // Show total immediately, calculate selected count asynchronously
            LibraryInfoText = $"Library · 🎞️ {totalVideos:N0} videos · 🎯 calculating...";
            
            // Update filter summary separately
            UpdateFilterSummaryText();
            
            // Calculate selected count asynchronously to avoid blocking UI
            _ = Task.Run(() =>
            {
                try
                {
                    int selectedCount = 0;
                    if (_currentFilterState != null && _libraryIndex != null)
                    {
                        // Use a faster approximation: count without file existence check for info display
                        var eligible = _libraryIndex.Items.AsEnumerable();
                        
                        // Apply filters without file existence check (much faster)
                        var enabledSourceIds = _libraryIndex.Sources
                            .Where(s => s.IsEnabled)
                            .Select(s => s.Id)
                            .ToHashSet();
                        eligible = eligible.Where(item => enabledSourceIds.Contains(item.SourceId));
                        
                        if (_currentFilterState.ExcludeBlacklisted)
                            eligible = eligible.Where(item => !item.IsBlacklisted);
                        if (_currentFilterState.FavoritesOnly)
                            eligible = eligible.Where(item => item.IsFavorite);
                        if (_currentFilterState.OnlyNeverPlayed)
                            eligible = eligible.Where(item => item.PlayCount == 0);
                        if (_currentFilterState.AudioFilter == AudioFilterMode.WithAudioOnly)
                            eligible = eligible.Where(item => item.HasAudio == true);
                        else if (_currentFilterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
                            eligible = eligible.Where(item => item.HasAudio == false);
                        if (_currentFilterState.MinDuration.HasValue)
                            eligible = eligible.Where(item => item.Duration.HasValue && item.Duration.Value >= _currentFilterState.MinDuration.Value);
                        if (_currentFilterState.MaxDuration.HasValue)
                            eligible = eligible.Where(item => item.Duration.HasValue && item.Duration.Value <= _currentFilterState.MaxDuration.Value);
                        if (_currentFilterState.OnlyKnownDuration)
                            eligible = eligible.Where(item => item.Duration.HasValue);
                        if (_currentFilterState.OnlyKnownLoudness)
                            eligible = eligible.Where(item => item.IntegratedLoudness.HasValue);
                        if (_currentFilterState.SelectedTags != null && _currentFilterState.SelectedTags.Count > 0)
                        {
                            if (_currentFilterState.TagMatchMode == TagMatchMode.And)
                                eligible = eligible.Where(item => _currentFilterState.SelectedTags.All(tag => item.Tags.Contains(tag)));
                            else
                                eligible = eligible.Where(item => _currentFilterState.SelectedTags.Any(tag => item.Tags.Contains(tag)));
                        }
                        
                        selectedCount = eligible.Count();
                    }
                    else
                    {
                        selectedCount = totalVideos;
                    }
                    
                    // Update UI on UI thread
                    Dispatcher.UIThread.Post(() =>
                    {
                        LibraryInfoText = $"Library · 🎞️ {totalVideos:N0} videos · 🎯 {selectedCount:N0} selected";
                    });
                }
                catch (Exception ex)
                {
                    Log($"UpdateLibraryInfoText: ERROR calculating selected count - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    // Fallback: show total as selected
                    Dispatcher.UIThread.Post(() =>
                    {
                        LibraryInfoText = $"Library · 🎞️ {totalVideos:N0} videos · 🎯 {totalVideos:N0} selected";
                    });
                }
            });
        }

        private void UpdateFilterSummaryText()
        {
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
            if (_currentFilterState.AudioFilter == AudioFilterMode.WithAudioOnly)
                filterParts.Add("With audio");
            else if (_currentFilterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
                filterParts.Add("Without audio");
            if (_currentFilterState.MinDuration.HasValue || _currentFilterState.MaxDuration.HasValue)
                filterParts.Add("Duration");
            if (_currentFilterState.SelectedTags != null && _currentFilterState.SelectedTags.Count > 0)
                filterParts.Add($"{_currentFilterState.SelectedTags.Count} tag(s)");

            if (filterParts.Count > 0)
            {
                FilterSummaryText = "Filters: " + string.Join(", ", filterParts);
            }
            else
            {
                FilterSummaryText = "Filters: None";
            }
        }

        private void UpdateCurrentVideoStatsUi()
        {
            // Ensure we're on UI thread for property updates
            if (!Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => UpdateCurrentVideoStatsUi());
                return;
            }

            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("UpdateCurrentVideoStatsUi: No current video path, clearing stats UI");
                CurrentVideoFileName = "No video playing";
                CurrentVideoFullPath = "";
                CurrentVideoPlayCount = 0;
                CurrentVideoLastPlayedDisplay = "Never";
                CurrentVideoIsFavoriteDisplay = "No";
                CurrentVideoIsBlacklistedDisplay = "No";
                CurrentVideoDurationDisplay = "Unknown";
                CurrentVideoHasAudioDisplay = "Unknown";
                CurrentVideoLoudnessDisplay = "Unknown";
                CurrentVideoPeakDisplay = "Unknown";
                CurrentVideoTagsDisplay = "None";
                return;
            }

            var path = _currentVideoPath;
            if (path == null)
            {
                Log("UpdateCurrentVideoStatsUi: Current video path is null, returning");
                return;
            }

            Log($"UpdateCurrentVideoStatsUi: Updating stats UI for video: {Path.GetFileName(path)}");
            CurrentVideoFileName = System.IO.Path.GetFileName(path) ?? "";
            CurrentVideoFullPath = path ?? "";

            // Look up all video info from library item
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
                    Log($"UpdateCurrentVideoStatsUi: Found library item - PlayCount: {playCount}, Favorite: {isFavorite}, Blacklisted: {isBlacklisted}, HasAudio: {hasAudio}, Duration: {duration?.TotalSeconds ?? -1}s");
                }
                else
                {
                    Log($"UpdateCurrentVideoStatsUi: Library item not found for path: {path}");
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

            // Display duration
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

            // Display loudness info from library item
            if (hasAudio == true)
            {
                CurrentVideoHasAudioDisplay = "Yes";
                if (integratedLoudness.HasValue)
                {
                    CurrentVideoLoudnessDisplay = $"{integratedLoudness.Value:F1} dB";
                }
                else
                {
                    CurrentVideoLoudnessDisplay = "Unknown";
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
                CurrentVideoPeakDisplay = "N/A";
            }
            else
            {
                CurrentVideoHasAudioDisplay = "Unknown";
                CurrentVideoLoudnessDisplay = "Unknown";
                CurrentVideoPeakDisplay = "Unknown";
            }

            // Display tags
            if (item != null && item.Tags != null && item.Tags.Count > 0)
            {
                CurrentVideoTagsDisplay = string.Join(", ", item.Tags);
            }
            else
            {
                CurrentVideoTagsDisplay = "None";
            }

            // Update toggle buttons to reflect current state
            FavoriteToggle.IsChecked = isFavorite;
            BlacklistToggle.IsChecked = isBlacklisted;
            
            Log($"UpdateCurrentVideoStatsUi: Stats UI updated - Favorite: {CurrentVideoIsFavoriteDisplay}, Blacklisted: {CurrentVideoIsBlacklistedDisplay}, Duration: {CurrentVideoDurationDisplay}, Audio: {CurrentVideoHasAudioDisplay}, Tags: {CurrentVideoTagsDisplay}");
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
                    StatusTextBlock.Text = $"Scanning / indexing… ({alreadyCachedCount} already cached, {filesToScan.Length} to scan)";
                }
                else
                {
                    StatusTextBlock.Text = $"Scanning / indexing… (0/{total} files processed)";
                }
            });

            // If all files are already cached, we're done
            if (filesToScan.Length == 0)
            {
                Log($"ScanDurationsAsync: All {total} files already have duration cached, skipping scan");
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Ready ({total} files, all cached)";
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
                    if ((now - _lastDurationStatusUpdate).TotalMilliseconds >= 100 || newProcessed == total)
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
                        StatusTextBlock.Text = $"Scanning / indexing… ({newProcessed}/{total} files processed)";
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
                UpdateCurrentVideoStatsUi();
                if (string.IsNullOrEmpty(_currentVideoPath))
                {
                    StatusTextBlock.Text = "Ready";
                }
                else
                {
                    StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(_currentVideoPath)}";
                }
            });
            Log("ScanDurationsAsync: Duration scan complete");
        }

        private void StartLoudnessScan(string rootFolder)
        {
            Log($"StartLoudnessScan: Starting loudness scan for folder: {rootFolder}");
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
                    await ScanLoudnessAsync(rootFolder, token);
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

        private async Task ScanLoudnessAsync(string rootFolder, CancellationToken cancellationToken)
        {
            Log($"ScanLoudnessAsync: Starting loudness scan for folder: {rootFolder}");
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

            // Filter out already-scanned files (optional: allow rescan)
            // Check library items for existing loudness data
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
            
            string[] filesToScan = allFiles.Where(f => !filesWithLoudness.Contains(f)).ToArray();
            int alreadyScannedCount = allFiles.Length - filesToScan.Length;
            Log($"ScanLoudnessAsync: {alreadyScannedCount} files already have loudness data, {filesToScan.Length} files need scanning");

            int total = allFiles.Length;
            int processed = alreadyScannedCount;
            int noAudioCount = 0;
            int errorCount = 0;
            var processedLock = new object();

            // Update UI to show scan started
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                if (alreadyScannedCount > 0)
                {
                    StatusTextBlock.Text = $"Scanning loudness… ({alreadyScannedCount} already scanned, {filesToScan.Length} to scan)";
                }
                else
                {
                    StatusTextBlock.Text = $"Scanning loudness… (0/{total} files processed)";
                }
            });

            // If all files are already scanned, we're done
            if (filesToScan.Length == 0)
            {
                Log($"ScanLoudnessAsync: All {total} files already have loudness data, skipping scan");
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Ready ({total} files, all scanned)";
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
                        startInfo.ArgumentList.Add("-af");
                        startInfo.ArgumentList.Add("volumedetect");
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
                                // Read stderr (ffmpeg outputs volumedetect info to stderr)
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
                    if ((now - _lastLoudnessStatusUpdate).TotalMilliseconds >= 100 || newProcessed == total)
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
                        StatusTextBlock.Text = $"Scanning loudness… ({newProcessed}/{total} files processed{noAudioText}{errorText})";
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
            Log("ScanLoudnessAsync: Updating UI");
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                var noAudioText = noAudioCount > 0 ? $", {noAudioCount} without audio" : "";
                var errorText = errorCount > 0 ? $", {errorCount} errors" : "";
                if (string.IsNullOrEmpty(_currentVideoPath))
                {
                    StatusTextBlock.Text = $"Ready ({total} files scanned{noAudioText}{errorText})";
                }
                else
                {
                    StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(_currentVideoPath)}";
                }
            });
            Log("ScanLoudnessAsync: Loudness scan complete");
        }

        private FileLoudnessInfo? ParseLoudnessFromFFmpegOutput(string output, int exitCode = 0)
        {
            // Parse mean_volume and max_volume from ffmpeg stderr output
            // Example output:
            // [Parsed_volumedetect_0 @ 0x...] mean_volume: -20.5 dB
            // [Parsed_volumedetect_0 @ 0x...] max_volume: -12.3 dB

            double? meanVolumeDb = null;
            double? peakDb = null;

            var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
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

            // Return info only if we got both values (success with audio)
            // Special case: -91.0 dB is often a placeholder/default value ffmpeg outputs
            // when there's no actual audio stream, so treat it as no audio
            if (meanVolumeDb.HasValue && peakDb.HasValue)
            {
                // Check if this is the -91.0 dB placeholder (indicating no real audio)
                if (Math.Abs(meanVolumeDb.Value - (-91.0)) < 0.1 && Math.Abs(peakDb.Value - (-91.0)) < 0.1)
                {
                    return new FileLoudnessInfo
                    {
                        MeanVolumeDb = 0.0,
                        PeakDb = 0.0,
                        HasAudio = false
                    };
                }
                
                return new FileLoudnessInfo
                {
                    MeanVolumeDb = meanVolumeDb.Value,
                    PeakDb = peakDb.Value,
                    HasAudio = true
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
                Log("  Setting up LibraryItemsControl...");
                // Set up Library panel collections and initial state
                if (LibraryItemsControl != null)
                {
                    LibraryItemsControl.ItemsSource = _libraryItems;
                    Log($"InitializeLibraryPanel: LibraryItemsControl.ItemsSource set, collection has {_libraryItems.Count} items");
                }
                else
                {
                    Log("InitializeLibraryPanel: WARNING - LibraryItemsControl is null!");
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
                    LibraryInfoText = "Library · 🎞️ 0 videos · 🎯 0 selected";
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
                
                // Add each source
                Log($"    Adding {_libraryIndex.Sources.Count} sources...");
                foreach (var source in _libraryIndex.Sources)
                {
                    var displayName = !string.IsNullOrEmpty(source.DisplayName) 
                        ? source.DisplayName 
                        : System.IO.Path.GetFileName(source.RootPath);
                    var item = new ComboBoxItem { Content = displayName, Tag = source.Id };
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
                                            Log("UpdateLibraryPanel: Cancelled during item addition");
                                            return;
                                        }
                                        _libraryItems.Add(item);
                                    }
                                    Log($"UpdateLibraryPanel: UI thread callback completed. _libraryItems now has {_libraryItems.Count} items. LibraryItemsControl.ItemsSource is set: {LibraryItemsControl?.ItemsSource != null}, LibraryItemsControl.IsVisible: {LibraryItemsControl?.IsVisible}, LibraryPanelContainer.IsVisible: {LibraryPanelContainer?.IsVisible}");
                                    
                                    // Force a refresh of the ItemsControl
                                    if (LibraryItemsControl != null)
                                    {
                                        var temp = LibraryItemsControl.ItemsSource;
                                        LibraryItemsControl.ItemsSource = null;
                                        LibraryItemsControl.ItemsSource = temp;
                                        Log("UpdateLibraryPanel: Forced ItemsControl refresh");
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
                UpdateLibraryPanel();
            }
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
                return;
                
            // Don't process if this is being set programmatically (during UI binding updates)
            // Only process if it's a user interaction (the toggle button is loaded and user clicks it)
            if (sender is ToggleButton toggle && toggle.Tag is LibraryItem item)
            {
                // Check if the toggle's IsChecked matches the item's current state
                // If it doesn't match, this is a user action. If it matches, it's just a binding update.
                var toggleState = toggle.IsChecked == true;
                if (item.IsFavorite == toggleState)
                {
                    // State matches - this is likely a binding update, not a user action
                    return;
                }
                
                Log($"UI ACTION: LibraryItemFavorite toggled for '{item.FileName}' to: {toggleState}");
                item.IsFavorite = toggleState;
                _libraryService.UpdateItem(item);
                _ = Task.Run(() => _libraryService.SaveLibrary());
                UpdateLibraryPanel();
            }
        }

        private void LibraryItemBlacklist_Changed(object? sender, RoutedEventArgs e)
        {
            // Don't process if we're updating the library items UI
            if (_isUpdatingLibraryItems || _isInitializingLibraryPanel)
                return;
                
            // Don't process if this is being set programmatically (during UI binding updates)
            // Only process if it's a user interaction
            if (sender is ToggleButton toggle && toggle.Tag is LibraryItem item)
            {
                // Check if the toggle's IsChecked matches the item's current state
                // If it doesn't match, this is a user action. If it matches, it's just a binding update.
                var toggleState = toggle.IsChecked == true;
                if (item.IsBlacklisted == toggleState)
                {
                    // State matches - this is likely a binding update, not a user action
                    return;
                }
                
                Log($"UI ACTION: LibraryItemBlacklist toggled for '{item.FileName}' to: {toggleState}");
                item.IsBlacklisted = toggleState;
                _libraryService.UpdateItem(item);
                _ = Task.Run(() => _libraryService.SaveLibrary());
                UpdateLibraryPanel();
                // Rebuild queue if item was blacklisted
                if (item.IsBlacklisted)
                {
                    RebuildPlayQueueIfNeeded();
                }
            }
        }

        private async void LibraryItemTags_Click(object? sender, RoutedEventArgs e)
        {
            Log("UI ACTION: LibraryItemTags clicked");
            if (sender is Button button && button.Tag is LibraryItem item)
            {
                Log($"LibraryItemTags_Click: Opening tags dialog for: {item.FileName}");
                var dialog = new ItemTagsDialog(item, _libraryIndex, _libraryService);
                var result = await dialog.ShowDialog<bool?>(this);
                if (result == true)
                {
                    Log($"LibraryItemTags_Click: Tags updated for: {item.FileName}");
                    // Update library panel if visible
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    // Update stats if this is the current video
                    if (_currentVideoPath == item.FullPath)
                    {
                        UpdateCurrentVideoStatsUi();
                    }
                }
            }
        }


        private void ShowLibraryPanelMenuItem_Click(object? sender, RoutedEventArgs e)
        {
            var showPanel = ShowLibraryPanelMenuItem.IsChecked == true;
            Log($"UI ACTION: ShowLibraryPanelMenuItem clicked, setting show panel to: {showPanel}");
            var oldValue = _showLibraryPanel;
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
                    if (StatusTextBlock.Text == "Finding eligible videos..." || 
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
                if (StatusTextBlock.Text == "Finding eligible videos..." || 
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
        }

        #endregion

        #region Video Playback

        private void PlayFromPath(string videoPath)
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
                Log($"PlayFromPath: ERROR - Video file not found or path is empty. Path: {videoPath ?? "null"}, Exists: {(!string.IsNullOrEmpty(videoPath) && File.Exists(videoPath))}");
                StatusTextBlock.Text = "Video file not found.";
                return;
            }

            Log($"PlayFromPath: File exists, calling PlayVideo - addToHistory: true");
            PlayVideo(videoPath, addToHistory: true);
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
                var previousPath = _currentVideoPath;
                _currentVideoPath = videoPath;
                Log($"PlayVideo: Current video path set - Previous: {previousPath ?? "null"}, New: {videoPath ?? "null"}");
                
                StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(videoPath)}";

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
                    Log("PlayVideo: Disposing previous media");
                    _currentMedia.Dispose();
                }

                // Create and play new media
                if (videoPath != null)
                {
                    // Store user volume preference before normalization
                    _userVolumePreference = (int)VolumeSlider.Value;
                    Log($"PlayVideo: User volume preference: {_userVolumePreference}");

                    Log($"PlayVideo: Creating new Media object from path");
                    _currentMedia = new Media(_libVLC, videoPath, FromType.FromPath);
                    
                    // Set input-repeat option for seamless looping when loop is enabled
                    if (_isLoopEnabled)
                    {
                        Log("PlayVideo: Loop is enabled - adding input-repeat option");
                        _currentMedia.AddOption(":input-repeat=65535");
                    }
                    
                    // Apply volume normalization (must be called before Parse/Play)
                    Log($"PlayVideo: Applying volume normalization - Mode: {_volumeNormalizationMode}");
                    ApplyVolumeNormalization();
                    
                    // Parse media to get track information (including video dimensions)
                    Log("PlayVideo: Parsing media to get track information");
                    _currentMedia.Parse();
                    
                    // Try to get video aspect ratio from tracks immediately
                    UpdateAspectRatioFromTracks();
                    
                    Log("PlayVideo: Starting playback");
                    _mediaPlayer.Play(_currentMedia);
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
                else
                {
                    Log("PlayVideo: ERROR - videoPath is null, returning");
                    return;
                }

                // Update PlayPause button state
                PlayPauseButton.IsChecked = true;

                // Initialize seek bar (resets to 0, disabled until length known)
                InitializeSeekBar();

                // Preview player disabled - no thumbnail generation
                // Just clear any cached preview data
                _cachedPreviewBitmap?.Dispose();
                _cachedPreviewBitmap = null;

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
                if (VolumeSlider.Value == 100 && _mediaPlayer.Volume == 0)
                {
                    Log("PlayVideo: Initializing volume slider (first video)");
                    _mediaPlayer.Volume = 100;
                    VolumeSlider.Value = 100;
                }

                // History is now tracked via LibraryItem.LastPlayedUtc (updated in RecordPlayback)

                // Note: UpdateCurrentVideoStatsUi() is already called by RecordPlayback()
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
                StatusTextBlock.Text = "Please import a folder first (Library → Import Folder).";
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
                    StatusTextBlock.Text = "Finding eligible videos...";

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
                    PlayVideo(pick);
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
                        Log("PlayRandomVideoAsync: No eligible videos found");
                        StatusTextBlock.Text = "No eligible videos found. Check your filters or import a folder.";
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
                StatusTextBlock.Text = "Finding eligible videos...";
                pool = await GetEligiblePoolAsync();
                Log($"PlayRandomVideoAsync: Eligible pool size: {pool.Length}");
            }

            if (pool.Length == 0)
            {
                Log("PlayRandomVideoAsync: No eligible videos found in pool");
                StatusTextBlock.Text = "No eligible videos found. Check your filters or import a folder.";
                return;
            }

            var randomIndex = _rng.Next(pool.Length);
            var randomPick = pool[randomIndex];
            Log($"PlayRandomVideoAsync: Randomly selected video {randomIndex + 1} of {pool.Length}: {Path.GetFileName(randomPick)}");
            PlayVideo(randomPick);
        }

        #endregion

        #region Loop Toggle

        private void LoopToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // Update the loop flag
            _isLoopEnabled = LoopToggle.IsChecked == true;
            Log($"UI ACTION: LoopToggle changed to: {_isLoopEnabled}");
            
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
            
            // Playback settings
            public string? SeekStep { get; set; }
            public int VolumeStep { get; set; } = 5;
            public double? IntervalSeconds { get; set; }
            public VolumeNormalizationMode VolumeNormalizationMode { get; set; } = VolumeNormalizationMode.Off;
            public AudioFilterMode AudioFilterMode { get; set; } = AudioFilterMode.PlayAll;
            
            // Filter state
            public FilterState? FilterState { get; set; }
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
            _volumeNormalizationMode = settings.VolumeNormalizationMode;
            _audioFilterMode = settings.AudioFilterMode;
            
            // Apply filter state
            var previousFilterState = _currentFilterState;
            _currentFilterState = settings.FilterState ?? new FilterState();
            if (previousFilterState != _currentFilterState)
            {
                Log($"STATE CHANGE: Filter state loaded from settings - FavoritesOnly={_currentFilterState.FavoritesOnly}, ExcludeBlacklisted={_currentFilterState.ExcludeBlacklisted}, AudioFilter={_currentFilterState.AudioFilter}");
            }
            
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
            
            // Sync menu states for playback settings
            if (SeekStepFrameMenuItem != null)
                SeekStepFrameMenuItem.IsChecked = _seekStep == "Frame";
            if (SeekStep1sMenuItem != null)
                SeekStep1sMenuItem.IsChecked = _seekStep == "1s";
            if (SeekStep5sMenuItem != null)
                SeekStep5sMenuItem.IsChecked = _seekStep == "5s";
            if (SeekStep10sMenuItem != null)
                SeekStep10sMenuItem.IsChecked = _seekStep == "10s";

            if (VolumeStep1MenuItem != null)
                VolumeStep1MenuItem.IsChecked = _volumeStep == 1;
            if (VolumeStep2MenuItem != null)
                VolumeStep2MenuItem.IsChecked = _volumeStep == 2;
            if (VolumeStep5MenuItem != null)
                VolumeStep5MenuItem.IsChecked = _volumeStep == 5;

            // Sync volume normalization menu states
            if (VolumeNormalizationOffMenuItem != null)
                VolumeNormalizationOffMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.Off;
            if (VolumeNormalizationSimpleMenuItem != null)
                VolumeNormalizationSimpleMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.Simple;
            if (VolumeNormalizationLibraryAwareMenuItem != null)
                VolumeNormalizationLibraryAwareMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.LibraryAware;
            if (VolumeNormalizationAdvancedMenuItem != null)
                VolumeNormalizationAdvancedMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.Advanced;
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
                        settings.VolumeNormalizationMode = playbackSettings.VolumeNormalizationMode;
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
                
                // When in player view mode, save the saved state (what user wants when NOT in player view mode)
                // Otherwise, save the current state
                var settings = new AppSettings
                {
                    // View preferences
                    ShowMenu = _showMenu,
                    ShowStatusLine = _isPlayerViewMode ? _savedShowStatusLine : _showStatusLine,
                    ShowControls = _isPlayerViewMode ? _savedShowControls : _showControls,
                    ShowLibraryPanel = _isPlayerViewMode ? _savedShowLibraryPanel : _showLibraryPanel,
                    ShowStatsPanel = _isPlayerViewMode ? _savedShowStatsPanel : _showStatsPanel,
                    AlwaysOnTop = _alwaysOnTop,
                    IsPlayerViewMode = _isPlayerViewMode,
                    RememberLastFolder = _rememberLastFolder,
                    LastFolderPath = _lastFolderPath,
                    
                    // Playback settings
                    SeekStep = _seekStep,
                    VolumeStep = _volumeStep,
                    IntervalSeconds = intervalValue.HasValue ? (double?)intervalValue.Value : null,
                    VolumeNormalizationMode = _volumeNormalizationMode,
                    AudioFilterMode = _audioFilterMode,
                    
                    // Filter state (always save an object, never null)
                    FilterState = _currentFilterState ?? new FilterState()
                };
                
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
                    LibraryPanelContainer.IsVisible = _showLibraryPanel;
                    columns[0].Width = _showLibraryPanel ? GridLength.Auto : new GridLength(0);
                    
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
                    
                    // Import the folder
                    int importedCount = _libraryService.ImportFolder(path, null);
                    Log($"UI ACTION: ImportFolder completed, imported {importedCount} items");
                    
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
                    
                    // Show success message
                    var folderName = Path.GetFileName(path) ?? path;
                    StatusTextBlock.Text = $"Imported {importedCount} files from {folderName}";
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
                UpdateCurrentVideoStatsUi();
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
            var dialog = new ManageTagsDialog(_libraryIndex, _libraryService);
            var result = await dialog.ShowDialog<bool?>(this);
            if (result == true)
            {
                Log("ManageTagsMenuItem_Click: Tags updated, refreshing library panel and filter dialog");
                // Update library panel if visible
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
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

        private void ScanLoudness_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
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
            
            Log($"  Starting loudness scan for {sourceRoots.Count} source(s) in library");
            StatusTextBlock.Text = $"Starting loudness scan for {sourceRoots.Count} source(s)...";
            
            // Start scan for first source (could be enhanced to scan all sources)
            StartLoudnessScan(sourceRoots[0]);
        }

        private void VolumeNormalizationMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is MenuItem item)
            {
                // Uncheck all volume normalization items
                VolumeNormalizationOffMenuItem.IsChecked = false;
                VolumeNormalizationSimpleMenuItem.IsChecked = false;
                VolumeNormalizationLibraryAwareMenuItem.IsChecked = false;
                VolumeNormalizationAdvancedMenuItem.IsChecked = false;

                // Check the clicked item
                item.IsChecked = true;

                // Determine selected mode
                VolumeNormalizationMode newMode = VolumeNormalizationMode.Off;
                string modeName = "Off";
                if (item == VolumeNormalizationOffMenuItem)
                {
                    newMode = VolumeNormalizationMode.Off;
                    modeName = "Off";
                }
                else if (item == VolumeNormalizationSimpleMenuItem)
                {
                    newMode = VolumeNormalizationMode.Simple;
                    modeName = "Simple";
                }
                else if (item == VolumeNormalizationLibraryAwareMenuItem)
                {
                    newMode = VolumeNormalizationMode.LibraryAware;
                    modeName = "LibraryAware";
                }
                else if (item == VolumeNormalizationAdvancedMenuItem)
                {
                    newMode = VolumeNormalizationMode.Advanced;
                    modeName = "Advanced";
                }

                Log($"UI ACTION: VolumeNormalizationMenuItem clicked, setting mode to: {modeName}");
                // Update mode
                _volumeNormalizationMode = newMode;
                SavePlaybackSettings("Volume normalization");

                // Apply to current media if playing
                // Bug fix: Media options must be set before playback begins, so we need to recreate the media
                if (_currentMedia != null && _mediaPlayer != null && _libVLC != null && !string.IsNullOrEmpty(_currentVideoPath))
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
                        
                        // Create new media with updated normalization options
                        _currentMedia = new Media(_libVLC, _currentVideoPath, FromType.FromPath);
                        
                        // Set input-repeat option for seamless looping when loop is enabled
                        if (_isLoopEnabled)
                        {
                            _currentMedia.AddOption(":input-repeat=65535");
                        }
                        
                        // Apply volume normalization (must be called before Parse/Play)
                        ApplyVolumeNormalization();
                        
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
                        Log($"VolumeNormalizationMenuItem_Click: ERROR updating normalization - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"VolumeNormalizationMenuItem_Click: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"VolumeNormalizationMenuItem_Click: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                        }
                        StatusTextBlock.Text = $"Error updating normalization: {ex.Message}";
                    }
                }
            }
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
            NoRepeatToggle.IsChecked = NoRepeatMenuItem.IsChecked;
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

            var dialog = new FilterDialog(_currentFilterState, _libraryIndex);
            await dialog.ShowDialog<bool?>(this);

            if (dialog.WasApplied)
            {
                Log("UI ACTION: FilterDialog was applied - saving filter state and updating panel");
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
            var dialog = new ItemTagsDialog(item, _libraryIndex, _libraryService);
            var result = await dialog.ShowDialog<bool?>(this);
            
            if (result == true)
            {
                Log($"ManageTagsForCurrentVideo_Click: Tags updated for: {item.FileName}");
                // Update library panel if visible
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
                // Update stats for current video
                UpdateCurrentVideoStatsUi();
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
            UpdateCurrentVideoStatsUi();
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
        private int CalculateNormalizedVolume(FileLoudnessInfo info, int userVolumePreference)
        {
            Log($"CalculateNormalizedVolume: Starting - MeanVolumeDb: {info.MeanVolumeDb:F2}, PeakDb: {info.PeakDb:F2}, UserPreference: {userVolumePreference}, TargetLoudnessDb: {TargetLoudnessDb:F2}");
            
            // Calculate desired gain to reach target loudness
            var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
            Log($"CalculateNormalizedVolume: Initial gain calculation: {diffDb:F2} dB");
            
            // Apply max gain limit (prevent excessive boost/cut)
            var gainBeforeLimiter = diffDb;
            diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
            if (gainBeforeLimiter != diffDb)
            {
                Log($"CalculateNormalizedVolume: Gain clamped by MaxGainDb limit ({MaxGainDb} dB): {gainBeforeLimiter:F2} -> {diffDb:F2}");
            }
            
            // Limiter: Check if peak volume would exceed safe maximum
            // Calculate what the peak would be after gain adjustment
            var estimatedPeakDb = info.PeakDb + diffDb;
            Log($"CalculateNormalizedVolume: Estimated peak after gain: {estimatedPeakDb:F2} dB (limit: {MaxOutputPeakDb:F2} dB)");
            
            // If peak would exceed limit, reduce gain to prevent clipping/distortion
            if (estimatedPeakDb > MaxOutputPeakDb)
            {
                // Calculate maximum allowed gain to keep peak under limit
                var maxAllowedGain = MaxOutputPeakDb - info.PeakDb;
                Log($"CalculateNormalizedVolume: Peak would exceed limit - maxAllowedGain: {maxAllowedGain:F2} dB");
                
                // Use the more restrictive: target gain or peak-limited gain
                // For cuts (negative), always allow (making loud videos quieter is safe)
                if (diffDb > 0)
                {
                    var gainBeforePeakLimit = diffDb;
                    // If peak is already above limit (maxAllowedGain < 0), cap boost at 0
                    // This prevents applying an unintended cut when a boost was desired
                    // Otherwise, use the more restrictive of target gain or peak-limited gain
                    diffDb = maxAllowedGain < 0 ? 0 : Math.Min(diffDb, maxAllowedGain);
                    if (gainBeforePeakLimit != diffDb)
                    {
                        Log($"CalculateNormalizedVolume: Gain limited by peak protection: {gainBeforePeakLimit:F2} -> {diffDb:F2} dB");
                    }
                }
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
            Log($"ApplyVolumeNormalization: Starting - Mode: {_volumeNormalizationMode}, UserPreference: {_userVolumePreference}, CurrentVideoPath: {_currentVideoPath ?? "null"}");
            
            if (_currentMedia == null || _mediaPlayer == null || string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("ApplyVolumeNormalization: ERROR - CurrentMedia, MediaPlayer, or CurrentVideoPath is null/empty");
                return;
            }

            // If mode is Off: do NOT add audio filter, use slider value directly
            if (_volumeNormalizationMode == VolumeNormalizationMode.Off)
            {
                Log($"ApplyVolumeNormalization: Mode is Off - using direct volume: {_userVolumePreference}");
                _mediaPlayer.Volume = _userVolumePreference;
                return;
            }

            // If mode is Simple or Advanced: add audio filter (only once per media creation)
            if (_volumeNormalizationMode == VolumeNormalizationMode.Simple || _volumeNormalizationMode == VolumeNormalizationMode.Advanced)
            {
                Log($"ApplyVolumeNormalization: Adding normvol audio filter for real-time normalization");
                // Add the audio filter only one time per media creation
                // Use normvol filter for gentle real-time normalization
                _currentMedia.AddOption(":audio-filter=normvol");
                // Optional: conservative preamp (0.0 = no additional boost)
                _currentMedia.AddOption(":normvol-preamp=0.0");
            }

            // If mode is LibraryAware or Advanced: apply per-file gain adjustment
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware || _volumeNormalizationMode == VolumeNormalizationMode.Advanced)
            {
                Log($"ApplyVolumeNormalization: Getting loudness info from library for per-file normalization");
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null)
                {
                    Log($"ApplyVolumeNormalization: Loudness info found - HasAudio: {info.HasAudio}, MeanVolumeDb: {info.MeanVolumeDb:F2}, PeakDb: {info.PeakDb:F2}");
                    var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                    Log($"ApplyVolumeNormalization: Setting normalized volume: {finalVolume}");
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    Log($"ApplyVolumeNormalization: No loudness info found - using direct volume: {_userVolumePreference}");
                    // Fall back: if Library-aware mode but no stats, use direct volume
                    // If Advanced mode but no stats, still use real-time filter (already added above)
                    if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware)
                    {
                        _mediaPlayer.Volume = _userVolumePreference;
                    }
                    else
                    {
                        // Advanced mode: real-time filter already added, use slider value
                        _mediaPlayer.Volume = _userVolumePreference;
                    }
                }
            }
            else
            {
                // Simple mode: use slider value with real-time filter
                Log($"ApplyVolumeNormalization: Simple mode - using direct volume with real-time filter: {_userVolumePreference}");
                _mediaPlayer.Volume = _userVolumePreference;
            }
            
            Log($"ApplyVolumeNormalization: Completed - Final volume: {_mediaPlayer.Volume}");
        }

        private void VolumeSlider_ValueChanged(object? sender, Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs e)
        {
            var newVolume = (int)VolumeSlider.Value;
            Log($"UI ACTION: VolumeSlider value changed - New value: {newVolume}, Old value: {e.OldValue}, Mode: {_volumeNormalizationMode}");
            
            if (_mediaPlayer == null)
            {
                Log("VolumeSlider_ValueChanged: ERROR - MediaPlayer is null");
                return;
            }

            var oldPreference = _userVolumePreference;
            _userVolumePreference = newVolume;
            Log($"VolumeSlider_ValueChanged: User volume preference updated: {oldPreference} -> {newVolume}");

            // If mode is LibraryAware or Advanced and current video exists, recalculate normalized volume
            if ((_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware || _volumeNormalizationMode == VolumeNormalizationMode.Advanced) && !string.IsNullOrEmpty(_currentVideoPath))
            {
                Log($"VolumeSlider_ValueChanged: Library-aware mode - getting loudness info for normalization");
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null)
                {
                    // Recalculate normalized volume using current loudness data
                    var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                    Log($"VolumeSlider_ValueChanged: Setting normalized volume: {finalVolume}");
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    Log($"VolumeSlider_ValueChanged: No loudness info - using direct volume: {newVolume}");
                    // Fall back to direct volume
                    _mediaPlayer.Volume = newVolume;
                }
            }
            else
            {
                Log($"VolumeSlider_ValueChanged: Direct volume mode - setting volume: {newVolume}");
                // Off or Simple mode: set volume directly
                _mediaPlayer.Volume = newVolume;
            }

            // Update mute button state
            if (newVolume == 0)
            {
                Log("VolumeSlider_ValueChanged: Volume is 0 - muting");
                MuteButton.IsChecked = true;
            }
            else
            {
                Log($"VolumeSlider_ValueChanged: Volume is non-zero - unmuting, saving lastNonZeroVolume: {newVolume}");
                MuteButton.IsChecked = false;
                _lastNonZeroVolume = newVolume;
            }
            
            UpdateVolumeTooltip();
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
            VolumeSlider.Value = 0;
            // Preserve user volume preference when muting
            // _userVolumePreference remains unchanged
            UpdateVolumeTooltip();
        }

        private void MuteButton_Unchecked(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_mediaPlayer == null)
                return;

            // Unmute: restore last non-zero volume
            // Restore user preference and apply normalization if needed
            _userVolumePreference = _lastNonZeroVolume;
            VolumeSlider.Value = _lastNonZeroVolume;
            
            // Reapply normalization if in Library-aware or Advanced mode
            if ((_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware || _volumeNormalizationMode == VolumeNormalizationMode.Advanced) && !string.IsNullOrEmpty(_currentVideoPath))
            {
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null)
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
        }

        #region Seek Bar

        private void InitializeSeekBar()
        {
            if (SeekSlider == null)
                return;

            _isUserSeeking = false;
            _mediaLengthMs = 0;

            SeekSlider.Minimum = 0;
            SeekSlider.Maximum = 1;
            SeekSlider.Value = 0;
            SeekSlider.IsEnabled = false;
            UpdateStatusTimeDisplay(0);
        }

        private void SeekTimer_Tick(object? sender, EventArgs e)
        {
            if (_mediaPlayer == null || SeekSlider == null)
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

        private void UpdateStatusTimeDisplay(long timeMs)
        {
            if (StatusTimeTextBlock == null)
                return;

            StatusTimeTextBlock.Text = FormatTime(timeMs);
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

        private void SeekStepMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is MenuItem item)
            {
                // Uncheck all seek step items
                SeekStepFrameMenuItem.IsChecked = false;
                SeekStep1sMenuItem.IsChecked = false;
                SeekStep5sMenuItem.IsChecked = false;
                SeekStep10sMenuItem.IsChecked = false;

                // Check the clicked item
                item.IsChecked = true;

                // Update seek step
                _seekStep = item.Header?.ToString() ?? "5s";
                SavePlaybackSettings("Seek step");
            }
        }

        // Audio filter menu handler removed - now using FilterDialog

        private void VolumeStepMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is MenuItem item)
            {
                // Uncheck all volume step items
                VolumeStep1MenuItem.IsChecked = false;
                VolumeStep2MenuItem.IsChecked = false;
                VolumeStep5MenuItem.IsChecked = false;

                // Check the clicked item
                item.IsChecked = true;

                // Update volume step
                if (int.TryParse(item.Header?.ToString(), out var step))
                {
                    _volumeStep = step;
                    SavePlaybackSettings("Volume step");
                }
            }
        }

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

            // Apply normalization if in Library-aware mode
            if ((_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware || _volumeNormalizationMode == VolumeNormalizationMode.Advanced) && !string.IsNullOrEmpty(_currentVideoPath))
            {
                Log($"AdjustVolumeFromWheel: Library-aware mode - getting loudness info");
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null)
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
        }

        private void OnGlobalKeyDown(object? sender, KeyEventArgs e)
        {
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
                // Let TextBox handle everything (space, arrows, etc.)
                return;
            }

            // Check if focus is in a menu; if so, skip shortcuts
            if (e.Source is MenuItem)
            {
                return;
            }

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
                    // Always on top toggle
                    _alwaysOnTop = !_alwaysOnTop;
                    this.Topmost = _alwaysOnTop;
                    if (AlwaysOnTopMenuItem != null)
                    {
                        AlwaysOnTopMenuItem.IsChecked = _alwaysOnTop;
                    }
                    SaveSettings();
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

            // Apply normalization if in Library-aware mode
            if ((_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware || _volumeNormalizationMode == VolumeNormalizationMode.Advanced) && !string.IsNullOrEmpty(_currentVideoPath))
            {
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null)
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

            // Apply normalization if in Library-aware mode
            if ((_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware || _volumeNormalizationMode == VolumeNormalizationMode.Advanced) && !string.IsNullOrEmpty(_currentVideoPath))
            {
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null)
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
        public VolumeNormalizationMode VolumeNormalizationMode { get; set; } = VolumeNormalizationMode.Off;
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




