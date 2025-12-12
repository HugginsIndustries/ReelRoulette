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
        LibraryAware = 2
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

        // Favorites system
        private HashSet<string> _favorites = new(StringComparer.OrdinalIgnoreCase);

        // Blacklist system
        private HashSet<string> _blacklist = new(StringComparer.OrdinalIgnoreCase);

        // Duration cache system
        private Dictionary<string, long> _durationCache = new(StringComparer.OrdinalIgnoreCase);

        // Volume normalization constants
        private const double TargetLoudnessDb = -18.0;  // Target mean volume in dB
        private const double MaxGainDb = 6.0;          // Maximum gain adjustment in dB (±6.0)

        // Volume normalization
        private VolumeNormalizationMode _volumeNormalizationMode = VolumeNormalizationMode.Off;
        private readonly Dictionary<string, FileLoudnessInfo> _loudnessStats = 
            new(StringComparer.OrdinalIgnoreCase);
        private int _userVolumePreference = 100; // User's slider preference (0-200)

        // Queue system
        private Queue<string> _playQueue = new();
        private bool _noRepeatMode = true;

        // History system
        private List<HistoryEntry> _history = new();
        private const int MaxHistoryEntries = 20;

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

        // Loudness scanning
        private static SemaphoreSlim? _ffmpegSemaphore;
        private static readonly object _ffmpegSemaphoreLock = new object();

        // View prefs
        private bool _showMenu = true;
        private bool _showFolderSelection = true;
        private bool _showStatusLine = true;
        private bool _showControls = true;
        private bool _showBlacklistPanel = false;
        private bool _showFavoritesPanel = false;
        private bool _showRecentlyPlayedPanel = false;
        private bool _showStatsPanel = false;
        private bool _isFullScreen = false;
        private bool _alwaysOnTop = false;
        private bool _isPlayerViewMode = false;
        private bool _savedShowFolderSelection = true;
        private bool _savedShowStatusLine = true;
        private bool _savedShowControls = true;
        private bool _savedShowBlacklistPanel = false;
        private bool _savedShowFavoritesPanel = false;
        private bool _savedShowRecentlyPlayedPanel = false;
        private bool _savedShowStatsPanel = false;
        private bool _rememberLastFolder = true;
        private string? _lastFolderPath = null;

        // Aspect ratio tracking
        private double _currentVideoAspectRatio = 16.0 / 9.0; // Default 16:9
        private bool _hasValidAspectRatio = false;
        
        // Window size adjustment for aspect ratio locking
        private bool _isAdjustingSize = false;
        private Size _lastWindowSize;

        // Playback stats system
        private readonly Dictionary<string, FilePlaybackStats> _playbackStats 
            = new(StringComparer.OrdinalIgnoreCase);

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
            // #region agent log
            var subscriberCount = _propertyChanged?.GetInvocationList()?.Length ?? 0;
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run2", hypothesisId = "G", location = "MainWindow.axaml.cs:107", message = "OnPropertyChanged", data = new { propertyName = propertyName ?? "NULL", hasSubscribers = _propertyChanged != null, subscriberCount, isOnUIThread = Avalonia.Threading.Dispatcher.UIThread.CheckAccess() }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
            if (_propertyChanged != null)
            {
                // Ensure PropertyChanged is raised on UI thread
                if (Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
                {
                    try
                    {
                        _propertyChanged.Invoke(this, new PropertyChangedEventArgs(propertyName));
                        // #region agent log
                        try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run2", hypothesisId = "G", location = "MainWindow.axaml.cs:117", message = "PropertyChanged invoked", data = new { propertyName = propertyName ?? "NULL", subscriberCount }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                        // #endregion
                    }
                    catch (Exception ex)
                    {
                        // #region agent log
                        try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run2", hypothesisId = "G", location = "MainWindow.axaml.cs:120", message = "PropertyChanged exception", data = new { propertyName = propertyName ?? "NULL", exception = ex.Message }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                        // #endregion
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
                            // #region agent log
                            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run2", hypothesisId = "G", location = "MainWindow.axaml.cs:132", message = "PropertyChanged exception (async)", data = new { propertyName = propertyName ?? "NULL", exception = ex.Message }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                            // #endregion
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
                    // #region agent log
                    try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "F", location = "MainWindow.axaml.cs:130", message = "GlobalTotalPlays setter", data = new { oldValue = _globalTotalPlays, newValue = value }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                    // #endregion
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
                    // #region agent log
                    try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "F", location = "MainWindow.axaml.cs:206", message = "CurrentVideoFileName setter", data = new { oldValue = _currentVideoFileName ?? "NULL", newValue = value ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                    // #endregion
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
            InitializeComponent();
            
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

            // Load persisted data
            LoadFavorites();
            LoadHistory();
            LoadBlacklist();
            LoadDurationsCache();
            LoadLoudnessStats();
            LoadPlaybackStats();
            LoadViewPreferences();
            LoadPlaybackSettings();

            // Restore last folder if enabled and path exists
            if (_rememberLastFolder && !string.IsNullOrEmpty(_lastFolderPath) && Directory.Exists(_lastFolderPath))
            {
                FolderTextBox.Text = _lastFolderPath;
                // This will trigger the existing FolderTextBox.TextChanged handler which calls RebuildPlayQueueIfNeeded()
                // Also start duration scan
                StartDurationScan(_lastFolderPath);
            }

            // Sync menu/check states with defaults
            SyncMenuStates();
            ApplyViewPreferences();

            // Initialize panel UIs
            UpdateBlacklistUI();
            UpdateFavoritesUI();
            UpdateHistoryUI();

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

            // Rebuild queue when folder changes
            FolderTextBox.TextChanged += (s, e) => 
            {
                try
                {
                    RebuildPlayQueueIfNeeded();
                    // Don't auto-start duration scan - let user trigger it manually or do it lazily
                    // This prevents crashes on folder selection
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Error: {ex.Message}";
                }
            };
        }

        protected override void OnClosed(EventArgs e)
        {
            // Cancel any ongoing scan
            _scanCancellationSource?.Cancel();
            _scanCancellationSource?.Dispose();

            // Save data
            SaveLoudnessStats();
            SaveDurationsCache();
            SavePlaybackStats();
            SaveViewPreferences();
            SavePlaybackSettings();

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
            // Hand off end-of-media work asynchronously so UI thread stays responsive
            _ = HandleEndReachedAsync();
        }

        private async Task HandleEndReachedAsync()
        {
            try
            {
                // Ensure play/pause toggle reflects stopped state
                await Dispatcher.UIThread.InvokeAsync(() => PlayPauseButton.IsChecked = false);

                if (_isLoopEnabled)
                {
                    // LibVLC handles looping automatically via input-repeat option
                    // No action needed - the video will loop seamlessly
                    return;
                }
                else if (_autoPlayNext && !_isLoopEnabled)
                {
                    // If loop is off, honor autoplay to move to the next random selection
                    await Dispatcher.UIThread.InvokeAsync(() => PlayRandomVideo());
                }
            }
            catch (Exception ex)
            {
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    StatusTextBlock.Text = $"Playback error: {ex.Message}";
                });
            }
        }

        #region Favorites System

        private void LoadFavorites()
        {
            try
            {
                var path = AppDataManager.GetFavoritesPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var list = JsonSerializer.Deserialize<List<string>>(json) ?? new();
                    _favorites = new HashSet<string>(list, StringComparer.OrdinalIgnoreCase);
                }
            }
            catch
            {
                // Silently fail - worst case: favorites don't load
            }
        }

        private void SaveFavorites()
        {
            try
            {
                var path = AppDataManager.GetFavoritesPath();
                var list = _favorites.ToList();
                var json = JsonSerializer.Serialize(list, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Silently fail
            }
        }

        private void FavoriteToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                FavoriteToggle.IsEnabled = false;
                return;
            }

            FavoriteToggle.IsEnabled = true;

            if (FavoriteToggle.IsChecked == true)
            {
                _favorites.Add(_currentVideoPath);
                StatusTextBlock.Text = $"Added to favorites: {System.IO.Path.GetFileName(_currentVideoPath)}";
            }
            else
            {
                _favorites.Remove(_currentVideoPath);
                StatusTextBlock.Text = $"Removed from favorites: {System.IO.Path.GetFileName(_currentVideoPath)}";
            }
            SaveFavorites();
            UpdateFavoritesUI();
            
            // Update stats when favorites change
            RecalculateGlobalStats();
            UpdateCurrentVideoStatsUi();

            // Rebuild queue if favorites-only mode is active
            if (OnlyFavoritesCheckBox.IsChecked == true)
            {
                RebuildPlayQueueIfNeeded();
            }
        }

        private void OnlyFavoritesCheckBox_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            OnlyFavoritesMenuItem.IsChecked = OnlyFavoritesCheckBox.IsChecked == true;
            RebuildPlayQueueIfNeeded();
        }

        #endregion

        #region Blacklist System

        private void LoadBlacklist()
        {
            try
            {
                var path = AppDataManager.GetBlacklistPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var list = JsonSerializer.Deserialize<List<string>>(json) ?? new();
                    _blacklist = new HashSet<string>(list, StringComparer.OrdinalIgnoreCase);
                }
            }
            catch
            {
                // Silently fail
            }
        }

        private void SaveBlacklist()
        {
            try
            {
                var path = AppDataManager.GetBlacklistPath();
                var list = _blacklist.ToList();
                var json = JsonSerializer.Serialize(list, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Silently fail
            }
        }

        private void BlacklistCurrentVideo()
        {
            if (string.IsNullOrEmpty(_currentVideoPath))
                return;

            _blacklist.Add(_currentVideoPath);
            SaveBlacklist();

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
            _blacklist.Remove(videoPath);
            SaveBlacklist();
            RebuildPlayQueueIfNeeded();
            UpdatePerVideoToggleStates();
            UpdateBlacklistUI();
        }

        #endregion

        #region Playback Stats System

        private void LoadPlaybackStats()
        {
            try
            {
                var path = AppDataManager.GetPlaybackStatsPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, FilePlaybackStats>>(json) ?? new();
                    _playbackStats.Clear();
                    foreach (var kvp in dict)
                    {
                        _playbackStats[kvp.Key] = kvp.Value;
                    }
                }
            }
            catch
            {
                // Silently fail - worst case: stats don't load
            }
        }

        private void SavePlaybackStats()
        {
            try
            {
                var path = AppDataManager.GetPlaybackStatsPath();
                var json = JsonSerializer.Serialize(_playbackStats, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Silently fail
            }
        }

        private void RecordPlayback(string path)
        {
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "A", location = "MainWindow.axaml.cs:666", message = "RecordPlayback entry", data = new { path = path ?? "NULL", _currentVideoPath = _currentVideoPath ?? "NULL", statsExists = _playbackStats.ContainsKey(path ?? "") }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
            if (string.IsNullOrEmpty(path))
                return;

            bool isNew = !_playbackStats.TryGetValue(path, out var stats);
            int oldPlayCount = 0;
            if (!isNew && stats != null)
            {
                oldPlayCount = stats.PlayCount;
            }
            else
            {
                stats = new FilePlaybackStats
                {
                    PlayCount = 0,
                    LastPlayedUtc = null
                };
                _playbackStats[path] = stats;
            }

            // Capture the previous LastPlayedUtc before updating (for display purposes)
            // This way "Last played" shows when it was last played BEFORE this current play
            _previousLastPlayedUtc = stats.LastPlayedUtc;

            stats.PlayCount++;
            stats.LastPlayedUtc = DateTime.UtcNow;
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "C", location = "MainWindow.axaml.cs:686", message = "Stats updated", data = new { path = path ?? "NULL", oldPlayCount, newPlayCount = stats.PlayCount, isNew, totalStatsEntries = _playbackStats.Count }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion

            // Update UI immediately (we're already on UI thread when called from PlayVideo)
            // Call UpdateCurrentVideoStatsUi first to show current video, then recalculate globals
            UpdateCurrentVideoStatsUi();
            RecalculateGlobalStats();
            
            SavePlaybackStats();
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "A", location = "MainWindow.axaml.cs:694", message = "RecordPlayback exit", data = new { path = path ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
        }

        private void RecalculateGlobalStats()
        {
            // Ensure we're on UI thread for property updates
            if (!Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => RecalculateGlobalStats());
                return;
            }

            // Build union of all known video paths
            var knownVideos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Add duration cache keys
            lock (_durationCache)
            {
                foreach (var key in _durationCache.Keys)
                {
                    knownVideos.Add(key);
                }
            }

            // Add favorites
            foreach (var fav in _favorites)
            {
                knownVideos.Add(fav);
            }

            // Add blacklist
            foreach (var bl in _blacklist)
            {
                knownVideos.Add(bl);
            }

            // Add playback stats keys
            foreach (var key in _playbackStats.Keys)
            {
                knownVideos.Add(key);
            }

            // Calculate global stats
            GlobalTotalVideosKnown = knownVideos.Count;
            GlobalFavoritesCount = _favorites.Count;
            GlobalBlacklistCount = _blacklist.Count;

            // Calculate stats directly from _playbackStats dictionary
            // This ensures all playback stats are counted, regardless of other collections
            int uniquePlayed = 0;
            int totalPlays = 0;

            foreach (var kvp in _playbackStats)
            {
                if (kvp.Value.PlayCount > 0)
                {
                    uniquePlayed++;
                    totalPlays += kvp.Value.PlayCount;
                }
            }

            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "E", location = "MainWindow.axaml.cs:752", message = "RecalculateGlobalStats: calculated values", data = new { uniquePlayed, totalPlays, totalVideosKnown = knownVideos.Count, playbackStatsCount = _playbackStats.Count }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
            GlobalUniqueVideosPlayed = uniquePlayed;
            GlobalTotalPlays = totalPlays;
            GlobalNeverPlayedKnown = Math.Max(0, GlobalTotalVideosKnown - GlobalUniqueVideosPlayed);
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "F", location = "MainWindow.axaml.cs:757", message = "RecalculateGlobalStats: properties set", data = new { GlobalTotalPlays, GlobalUniqueVideosPlayed, GlobalTotalVideosKnown, GlobalNeverPlayedKnown }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
        }

        private void UpdateCurrentVideoStatsUi()
        {
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "D", location = "MainWindow.axaml.cs:758", message = "UpdateCurrentVideoStatsUi entry", data = new { _currentVideoPath = _currentVideoPath ?? "NULL", isOnUIThread = Avalonia.Threading.Dispatcher.UIThread.CheckAccess() }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
            // Ensure we're on UI thread for property updates
            if (!Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => UpdateCurrentVideoStatsUi());
                return;
            }

            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                // #region agent log
                try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "D", location = "MainWindow.axaml.cs:765", message = "UpdateCurrentVideoStatsUi: no current video", data = new { _currentVideoPath = _currentVideoPath ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                // #endregion
                CurrentVideoFileName = "No video playing";
                CurrentVideoFullPath = "";
                CurrentVideoPlayCount = 0;
                CurrentVideoLastPlayedDisplay = "Never";
                CurrentVideoIsFavoriteDisplay = "No";
                CurrentVideoIsBlacklistedDisplay = "No";
                CurrentVideoDurationDisplay = "Unknown";
                return;
            }

            var path = _currentVideoPath;
            if (path == null)
                return;

            bool statsFound = _playbackStats.TryGetValue(path, out var stats);
            int playCount = statsFound && stats != null ? stats.PlayCount : 0;
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "D", location = "MainWindow.axaml.cs:778", message = "UpdateCurrentVideoStatsUi: setting properties", data = new { path = path ?? "NULL", statsFound, playCount, fileName = System.IO.Path.GetFileName(path) ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
            CurrentVideoFileName = System.IO.Path.GetFileName(path) ?? "";
            CurrentVideoFullPath = path ?? "";

            if (statsFound && stats != null)
            {
                CurrentVideoPlayCount = stats.PlayCount;
                // Show the previous LastPlayedUtc (before current play) if available, otherwise current LastPlayedUtc, otherwise Never
                if (_previousLastPlayedUtc.HasValue)
                {
                    CurrentVideoLastPlayedDisplay = _previousLastPlayedUtc.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
                }
                else if (stats.LastPlayedUtc.HasValue)
                {
                    CurrentVideoLastPlayedDisplay = stats.LastPlayedUtc.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
                }
                else
                {
                    CurrentVideoLastPlayedDisplay = "Never";
                }
            }
            else
            {
                CurrentVideoPlayCount = 0;
                CurrentVideoLastPlayedDisplay = "Never";
            }

            CurrentVideoIsFavoriteDisplay = (path != null && _favorites.Contains(path)) ? "Yes" : "No";
            CurrentVideoIsBlacklistedDisplay = (path != null && _blacklist.Contains(path)) ? "Yes" : "No";

            // Look up duration
            long durationSeconds;
            lock (_durationCache)
            {
                if (path != null && _durationCache.TryGetValue(path, out durationSeconds))
                {
                    var duration = TimeSpan.FromSeconds(durationSeconds);
                    if (duration.TotalHours >= 1)
                    {
                        CurrentVideoDurationDisplay = duration.ToString(@"hh\:mm\:ss");
                    }
                    else
                    {
                        CurrentVideoDurationDisplay = duration.ToString(@"mm\:ss");
                    }
                }
                else
                {
                    CurrentVideoDurationDisplay = "Unknown";
                }
            }
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "D", location = "MainWindow.axaml.cs:803", message = "UpdateCurrentVideoStatsUi exit", data = new { CurrentVideoFileName, CurrentVideoPlayCount, CurrentVideoFullPath = CurrentVideoFullPath?.Substring(0, Math.Min(50, CurrentVideoFullPath?.Length ?? 0)) ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
        }

        #endregion

        #region Duration Cache System

        private void LoadDurationsCache()
        {
            try
            {
                var path = AppDataManager.GetDurationsPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, long>>(json) ?? new();
                    _durationCache = new Dictionary<string, long>(dict, StringComparer.OrdinalIgnoreCase);
                }
            }
            catch
            {
                // Silently fail
            }
        }

        private void SaveDurationsCache()
        {
            try
            {
                var path = AppDataManager.GetDurationsPath();
                var json = JsonSerializer.Serialize(_durationCache, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Silently fail
            }
        }

        private void LoadLoudnessStats()
        {
            try
            {
                var path = AppDataManager.GetLoudnessStatsPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, FileLoudnessInfo>>(json) ?? new();
                    lock (_loudnessStats)
                    {
                        _loudnessStats.Clear();
                        foreach (var kvp in dict)
                        {
                            _loudnessStats[kvp.Key] = kvp.Value;
                        }
                    }
                }
            }
            catch
            {
                // Silently fail
            }
        }

        private void SaveLoudnessStats()
        {
            try
            {
                var path = AppDataManager.GetLoudnessStatsPath();
                Dictionary<string, FileLoudnessInfo> dict;
                lock (_loudnessStats)
                {
                    dict = new Dictionary<string, FileLoudnessInfo>(_loudnessStats);
                }
                var json = JsonSerializer.Serialize(dict, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Silently fail
            }
        }

        private void StartDurationScan(string rootFolder)
        {
            // Cancel any existing scan
            lock (_durationCache)
            {
                if (_scanCancellationSource != null)
                    return; // Already scanning
                    
                _scanCancellationSource?.Cancel();
                _scanCancellationSource?.Dispose();
                _scanCancellationSource = new CancellationTokenSource();
            }

            var token = _scanCancellationSource.Token;

            // Start async scan on thread pool (not Task.Run to avoid thread pool issues)
            _ = Task.Factory.StartNew(async () =>
            {
                try
                {
                    await ScanDurationsAsync(rootFolder, token);
                }
                catch (Exception ex)
                {
                    // Log error to UI thread
                    try
                    {
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            StatusTextBlock.Text = $"Scan error: {ex.GetType().Name} - {ex.Message}";
                        });
                    }
                    catch
                    {
                        // UI might be disposed
                    }
                }
                finally
                {
                    lock (_durationCache)
                    {
                        _scanCancellationSource?.Dispose();
                        _scanCancellationSource = null;
                    }
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
                    }
                }
            }

            bool semaphoreAcquired = false;
            try
            {
                await _ffprobeSemaphore.WaitAsync(cancellationToken);
                semaphoreAcquired = true;
                // Get FFprobe path (bundled or system)
                var ffprobePath = NativeBinaryHelper.GetFFprobePath();
                if (string.IsNullOrEmpty(ffprobePath))
                {
                    // Fall back to system ffprobe on PATH
                    ffprobePath = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffprobe.exe" : "ffprobe";
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
                        catch { }
                        throw;
                    }
                }, linkedCts.Token);

                try
                {
                    var output = await outputTask;
                    
                    if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
                        return null;

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
                            return TimeSpan.FromSeconds(durationSeconds);
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
                                return TimeSpan.FromSeconds(durationSeconds);
                            }
                        }
                    }

                    return null;
                }
                catch (OperationCanceledException)
                {
                    // Timeout or cancellation - ensure process is killed
                    try
                    {
                        if (!process.HasExited)
                        {
                            process.Kill();
                        }
                    }
                    catch { }
                    return null;
                }
                catch (JsonException)
                {
                    // Invalid JSON - file might be corrupted or not a video
                    return null;
                }
                catch (Exception)
                {
                    // Other errors - return null to skip this file
                    return null;
                }
            }
            finally
            {
                if (semaphoreAcquired)
                {
                    _ffprobeSemaphore.Release();
                }
            }
        }

        private async Task ScanDurationsAsync(string rootFolder, CancellationToken cancellationToken)
        {
            // Get all video files in the folder tree
            string[] allFiles;
            try
            {
                allFiles = Directory.GetFiles(rootFolder, "*.*", SearchOption.AllDirectories)
                    .Where(f => _videoExtensions.Contains(
                        Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
            }
            catch (Exception ex)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Error scanning folder: {ex.Message}";
                });
                return;
            }

            // Filter out already-cached files upfront (batch check for performance)
            string[] filesToScan;
            int alreadyCachedCount;
            lock (_durationCache)
            {
                filesToScan = allFiles.Where(f => !_durationCache.ContainsKey(f)).ToArray();
                alreadyCachedCount = allFiles.Length - filesToScan.Length;
            }

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
                System.Diagnostics.Debug.WriteLine($"Using bundled FFprobe: {ffprobePath}");
            }
            else
            {
                System.Diagnostics.Debug.WriteLine("Using system FFprobe from PATH");
            }

            // Process only uncached files with parallel async execution
            var scanTasks = filesToScan.Select(async file =>
            {
                if (cancellationToken.IsCancellationRequested)
                    return;

                // Verify file exists and is accessible
                if (!System.IO.File.Exists(file))
                {
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
                    var durationSeconds = (long)duration.Value.TotalSeconds;
                    // Thread-safe access to dictionary
                    lock (_durationCache)
                    {
                        _durationCache[file] = durationSeconds;
                    }
                }
                // If duration is null, skip this file (don't write 0 - treat as "Unknown")

                int newProcessed;
                lock (processedLock)
                {
                    processed++;
                    newProcessed = processed;
                }

                // Update UI progress and save cache periodically (every 50 files)
                if ((newProcessed - alreadyCachedCount) % 50 == 0 || newProcessed == total)
                {
                    SaveDurationsCache(); // Save periodically during scan
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        StatusTextBlock.Text = $"Scanning / indexing… ({newProcessed}/{total} files processed)";
                    });
                }
            });

            // Wait for all scan tasks to complete
            await Task.WhenAll(scanTasks);

            // Final save cache and update UI
            SaveDurationsCache();
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
        }

        private void StartLoudnessScan(string rootFolder)
        {
            // Cancel any existing scan
            lock (_loudnessStats)
            {
                if (_scanCancellationSource != null)
                    return; // Already scanning
                    
                _scanCancellationSource?.Cancel();
                _scanCancellationSource?.Dispose();
                _scanCancellationSource = new CancellationTokenSource();
            }

            var token = _scanCancellationSource.Token;

            // Start async scan on thread pool
            _ = Task.Factory.StartNew(async () =>
            {
                try
                {
                    await ScanLoudnessAsync(rootFolder, token);
                }
                catch (Exception ex)
                {
                    // Log error to UI thread
                    try
                    {
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            StatusTextBlock.Text = $"Loudness scan error: {ex.GetType().Name} - {ex.Message}";
                        });
                    }
                    catch
                    {
                        // UI might be disposed
                    }
                }
                finally
                {
                    lock (_loudnessStats)
                    {
                        _scanCancellationSource?.Dispose();
                        _scanCancellationSource = null;
                    }
                }
            }, token, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        }

        private async Task ScanLoudnessAsync(string rootFolder, CancellationToken cancellationToken)
        {
            // FFmpeg presence check: verify that ffmpeg is available
            var ffmpegPath = NativeBinaryHelper.GetFFmpegPath();
            if (string.IsNullOrEmpty(ffmpegPath))
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = "Loudness scan unavailable: ffmpeg not found";
                });
                return;
            }

            // Verify ffmpeg can be executed
            try
            {
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
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        StatusTextBlock.Text = "Loudness scan unavailable: ffmpeg not found";
                    });
                    return;
                }
            }
            catch
            {
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
                allFiles = Directory.GetFiles(rootFolder, "*.*", SearchOption.AllDirectories)
                    .Where(f => _videoExtensions.Contains(
                        Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
            }
            catch (Exception ex)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Error scanning folder: {ex.Message}";
                });
                return;
            }

            // Filter out already-scanned files (optional: allow rescan)
            string[] filesToScan;
            int alreadyScannedCount;
            lock (_loudnessStats)
            {
                filesToScan = allFiles.Where(f => !_loudnessStats.ContainsKey(f)).ToArray();
                alreadyScannedCount = allFiles.Length - filesToScan.Length;
            }

            int total = allFiles.Length;
            int processed = alreadyScannedCount;
            int errors = 0;
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
                }
            }

            // Process only unscanned files with parallel async execution
            var scanTasks = filesToScan.Select(async file =>
            {
                if (cancellationToken.IsCancellationRequested)
                    return;

                // CRITICAL: Check file existence first
                if (!File.Exists(file))
                {
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

                        var outputTask = Task.Run(async () =>
                        {
                            try
                            {
                                process.Start();
                                // Read stderr (ffmpeg outputs volumedetect info to stderr)
                                var stderrTask = process.StandardError.ReadToEndAsync(linkedCts.Token);
                                await process.WaitForExitAsync(linkedCts.Token);
                                return await stderrTask;
                            }
                            catch
                            {
                                return "";
                            }
                        }, linkedCts.Token);

                        var output = await outputTask;

                        // Parse loudness from output
                        var loudnessInfo = ParseLoudnessFromFFmpegOutput(output);
                        if (loudnessInfo != null)
                        {
                            lock (_loudnessStats)
                            {
                                _loudnessStats[file] = loudnessInfo;
                            }
                        }
                        else
                        {
                            // Parse failed, increment error counter
                            lock (processedLock)
                            {
                                errors++;
                            }
                        }
                    }
                    catch
                    {
                        // Individual file failure - increment error counter but continue
                        lock (processedLock)
                        {
                            errors++;
                        }
                    }
                }
                finally
                {
                    if (semaphoreAcquired)
                    {
                        _ffmpegSemaphore.Release();
                    }
                }

                int newProcessed;
                lock (processedLock)
                {
                    processed++;
                    newProcessed = processed;
                }

                // Update UI progress and save cache periodically (every 50 files)
                if ((newProcessed - alreadyScannedCount) % 50 == 0 || newProcessed == total)
                {
                    SaveLoudnessStats(); // Save periodically during scan
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        var errorText = errors > 0 ? $" ({errors} errors)" : "";
                        StatusTextBlock.Text = $"Scanning loudness… ({newProcessed}/{total} files processed{errorText})";
                    });
                }
            });

            // Wait for all scan tasks to complete
            await Task.WhenAll(scanTasks);

            // Final save cache and update UI
            SaveLoudnessStats();
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                var errorText = errors > 0 ? $" ({errors} errors)" : "";
                if (string.IsNullOrEmpty(_currentVideoPath))
                {
                    StatusTextBlock.Text = $"Ready ({total} files scanned{errorText})";
                }
                else
                {
                    StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(_currentVideoPath)}";
                }
            });
        }

        private FileLoudnessInfo? ParseLoudnessFromFFmpegOutput(string output)
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

            // Return info only if we got both values
            if (meanVolumeDb.HasValue && peakDb.HasValue)
            {
                return new FileLoudnessInfo
                {
                    MeanVolumeDb = meanVolumeDb.Value,
                    PeakDb = peakDb.Value
                };
            }

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

        #region History System

        private void LoadHistory()
        {
            try
            {
                var path = AppDataManager.GetHistoryPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var list = JsonSerializer.Deserialize<List<HistoryEntry>>(json) ?? new();
                    _history = list;
                    UpdateHistoryUI();
                }
            }
            catch
            {
                // Silently fail
            }
        }

        private void SaveHistory()
        {
            try
            {
                var path = AppDataManager.GetHistoryPath();
                var json = JsonSerializer.Serialize(_history, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Silently fail
            }
        }

        private void AddToHistory(string videoPath)
        {
            var entry = new HistoryEntry
            {
                Path = videoPath,
                FileName = System.IO.Path.GetFileName(videoPath),
                PlayedAt = DateTime.Now
            };

            _history.Insert(0, entry); // Add to front

            // Keep only last N entries
            if (_history.Count > MaxHistoryEntries)
            {
                _history.RemoveRange(MaxHistoryEntries, _history.Count - MaxHistoryEntries);
            }

            SaveHistory();
            UpdateHistoryUI();
            UpdatePerVideoToggleStates();
        }

        private void UpdateHistoryUI()
        {
            RecentlyPlayedItemsControl.ItemsSource = _history.ToList();
        }

        private void UpdateBlacklistUI()
        {
            BlacklistItemsControl.ItemsSource = _blacklist.ToList();
        }

        private void UpdateFavoritesUI()
        {
            FavoritesItemsControl.ItemsSource = _favorites.ToList();
        }

        private void HistoryPlayAgain_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                PlayFromPath(path);
            }
        }

        private void RecentlyPlayedPlay_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                PlayFromPath(path);
            }
        }

        private void RecentlyPlayedShowInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                OpenFileLocation(path);
            }
        }

        private void RecentlyPlayedRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is HistoryEntry entry)
            {
                _history.Remove(entry);
                SaveHistory();
                UpdateHistoryUI();
                StatusTextBlock.Text = $"Removed from history: {entry.FileName}";
            }
        }

        private void BlacklistPlay_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                PlayFromPath(path);
            }
        }

        private void BlacklistRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                RemoveFromBlacklist(path);
                UpdateBlacklistUI();
                StatusTextBlock.Text = $"Removed from blacklist: {System.IO.Path.GetFileName(path)}";
            }
        }

        private void BlacklistShowInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                OpenFileLocation(path);
            }
        }

        private void FavoritesPlay_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                PlayFromPath(path);
            }
        }

        private void FavoritesRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                _favorites.Remove(path);
                SaveFavorites();

                // If the removed entry is the current video, update the toggle and status line
                if (path.Equals(_currentVideoPath, StringComparison.OrdinalIgnoreCase))
                {
                    UpdatePerVideoToggleStates();
                }

                UpdateFavoritesUI();
                StatusTextBlock.Text = $"Removed from favorites: {System.IO.Path.GetFileName(path)}";

                // Rebuild queue if favorites-only mode is active
                if (OnlyFavoritesCheckBox.IsChecked == true)
                {
                    RebuildPlayQueueIfNeeded();
                }
            }
        }

        private void FavoritesShowInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                OpenFileLocation(path);
            }
        }

        #endregion

        #region Queue System

        private string[] GetEligiblePool()
        {
            try
            {
                var root = FolderTextBox.Text?.Trim();
                if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
                {
                    return Array.Empty<string>();
                }

                string[] allFiles;
                try
                {
                    allFiles = Directory.GetFiles(root, "*.*", SearchOption.AllDirectories)
                        .Where(f => _videoExtensions.Contains(
                            Path.GetExtension(f).ToLowerInvariant()))
                        .ToArray();
                }
                catch
                {
                    return Array.Empty<string>();
                }

                // Filter blacklisted items
                allFiles = allFiles.Where(f => !_blacklist.Contains(f)).ToArray();

                // Apply favorites-only filter if enabled
                if (OnlyFavoritesCheckBox.IsChecked == true)
                {
                    allFiles = allFiles.Where(f => _favorites.Contains(f)).ToArray();
                }

                // Apply duration filters (ensure we're on UI thread for ComboBox access)
                long? minDuration = null;
                long? maxDuration = null;
                
                try
                {
                    if (Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
                    {
                        minDuration = ParseDurationFilter(MinDurationComboBox?.SelectedItem);
                        maxDuration = ParseDurationFilter(MaxDurationComboBox?.SelectedItem);
                    }
                    else
                    {
                        // If not on UI thread, dispatch and get values
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            try
                            {
                                minDuration = ParseDurationFilter(MinDurationComboBox?.SelectedItem);
                                maxDuration = ParseDurationFilter(MaxDurationComboBox?.SelectedItem);
                            }
                            catch
                            {
                                // Ignore errors
                            }
                        });
                        // For now, just skip duration filtering if not on UI thread
                        minDuration = null;
                        maxDuration = null;
                    }
                }
                catch
                {
                    // If filter parsing fails, skip duration filtering
                    minDuration = null;
                    maxDuration = null;
                }

            if (minDuration.HasValue || maxDuration.HasValue)
            {
                // Only include videos with known duration when filters are active
                // Thread-safe access to cache
                Dictionary<string, long> cacheSnapshot;
                lock (_durationCache)
                {
                    // Create a snapshot to avoid holding the lock during LINQ operations
                    cacheSnapshot = new Dictionary<string, long>(_durationCache, StringComparer.OrdinalIgnoreCase);
                }
                
                allFiles = allFiles.Where(f =>
                {
                    if (!cacheSnapshot.TryGetValue(f, out var duration))
                        return false; // Exclude unknown duration

                    if (minDuration.HasValue && duration < minDuration.Value)
                        return false;
                    if (maxDuration.HasValue && duration > maxDuration.Value)
                        return false;

                    return true;
                }).ToArray();
            }

                return allFiles;
            }
            catch (Exception ex)
            {
                // Log error but don't crash
                System.Diagnostics.Debug.WriteLine($"GetEligiblePool error: {ex.Message}");
                return Array.Empty<string>();
            }
        }

        private void RebuildPlayQueueIfNeeded()
        {
            if (!_noRepeatMode)
                return;

            var pool = GetEligiblePool();
            if (pool.Length == 0)
            {
                _playQueue.Clear();
                return;
            }

            // Shuffle using Fisher-Yates
            var shuffled = pool.OrderBy(x => _rng.Next()).ToList();
            _playQueue = new Queue<string>(shuffled);
        }

        private void NoRepeatToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _noRepeatMode = NoRepeatToggle.IsChecked == true;
            NoRepeatMenuItem.IsChecked = _noRepeatMode;
            if (_noRepeatMode)
            {
                RebuildPlayQueueIfNeeded();
            }
            else
            {
                _playQueue.Clear();
            }
        }

        #endregion

        #region Video Playback

        private void PlayFromPath(string videoPath)
        {
            // Central helper to play a video from any panel
            // Validates path and ensures it's in the current library (or safely handles if not)
            // Sets the current video path selection
            // Starts playback via MediaPlayer
            // Updates history/timeline and stats (if already implemented)
            // Respects existing favorite/blacklist status (no automatic changes)
            if (string.IsNullOrEmpty(videoPath) || !File.Exists(videoPath))
            {
                StatusTextBlock.Text = "Video file not found.";
                return;
            }

            PlayVideo(videoPath, addToHistory: true);
        }

        private void OpenFileLocation(string? path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
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
                    if (!string.IsNullOrEmpty(directory))
                    {
                        var processInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = "xdg-open",
                            Arguments = $"\"{directory}\"",
                            UseShellExecute = false
                        };
                        System.Diagnostics.Process.Start(processInfo);
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
            // #region agent log
            try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "A", location = "MainWindow.axaml.cs:1366", message = "PlayVideo called", data = new { videoPath = videoPath ?? "NULL", addToHistory, currentVideoPathBefore = _currentVideoPath ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
            // #endregion
            if (_mediaPlayer == null || _libVLC == null)
                return;

            try
            {
                _currentVideoPath = videoPath;
                // #region agent log
                try { System.IO.File.AppendAllText(@"c:\dev\ReelRoulette\ReelRoulette\.cursor\debug.log", System.Text.Json.JsonSerializer.Serialize(new { sessionId = "debug-session", runId = "run1", hypothesisId = "B", location = "MainWindow.axaml.cs:1373", message = "_currentVideoPath set", data = new { videoPath = videoPath ?? "NULL", _currentVideoPath = _currentVideoPath ?? "NULL" }, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }) + "\n"); } catch { }
                // #endregion
                StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(videoPath)}";

                // Record playback stats
                if (videoPath != null)
                {
                    RecordPlayback(videoPath);
                }

                // Update per-video toggle UI
                UpdatePerVideoToggleStates();

                // Dispose previous media
                _currentMedia?.Dispose();

                // Create and play new media
                if (videoPath != null)
                {
                    // Store user volume preference before normalization
                    _userVolumePreference = (int)VolumeSlider.Value;

                    _currentMedia = new Media(_libVLC, videoPath, FromType.FromPath);
                    
                    // Set input-repeat option for seamless looping when loop is enabled
                    if (_isLoopEnabled)
                    {
                        _currentMedia.AddOption(":input-repeat=65535");
                    }
                    
                    // Apply volume normalization (must be called before Parse/Play)
                    ApplyVolumeNormalization();
                    
                    // Parse media to get track information (including video dimensions)
                    _currentMedia.Parse();
                    
                    // Try to get video aspect ratio from tracks immediately
                    UpdateAspectRatioFromTracks();
                    
                    _mediaPlayer.Play(_currentMedia);
                    
                    // Also try again after a short delay in case tracks weren't available immediately
                    // This helps with files where Parse() doesn't immediately populate tracks
                    Task.Delay(100).ContinueWith(_ =>
                    {
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            if (!_hasValidAspectRatio && _currentMedia != null)
                            {
                                UpdateAspectRatioFromTracks();
                            }
                        });
                    });
                }
                else
                {
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
                        _playbackTimeline.RemoveRange(_timelineIndex + 1, _playbackTimeline.Count - _timelineIndex - 1);
                    }
                    // Add new video to timeline
                    _playbackTimeline.Add(videoPath);
                    _timelineIndex = _playbackTimeline.Count - 1;
                }
                _isNavigatingTimeline = false;

                // Update Previous/Next button states
                PreviousButton.IsEnabled = _timelineIndex > 0;
                NextButton.IsEnabled = _timelineIndex < _playbackTimeline.Count - 1;

                // Initialize volume slider if first video
                if (VolumeSlider.Value == 100 && _mediaPlayer.Volume == 0)
                {
                    _mediaPlayer.Volume = 100;
                    VolumeSlider.Value = 100;
                }

                // Add to history
                if (addToHistory)
                {
                    AddToHistory(videoPath);
                }

                // Note: UpdateCurrentVideoStatsUi() is already called by RecordPlayback()
                // No need to call it again here
            }
            catch (Exception ex)
            {
                StatusTextBlock.Text = "Failed to play video: " + ex.Message;
            }
        }

        private void PlayRandomVideo()
        {
            var root = FolderTextBox.Text?.Trim();

            if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
            {
                StatusTextBlock.Text = "Please select a valid folder first.";
                return;
            }

            string[] pool;

            if (_noRepeatMode)
            {
                // Use queue system
                if (_playQueue.Count == 0)
                {
                    RebuildPlayQueueIfNeeded();
                }

                if (_playQueue.Count == 0)
                {
                    var eligiblePool = GetEligiblePool();
                    if (eligiblePool.Length == 0)
                    {
                        StatusTextBlock.Text = OnlyFavoritesCheckBox.IsChecked == true
                            ? "No favorite videos in this folder."
                            : "No video files found in that folder.";
                        return;
                    }
                    // Rebuild should have populated, but if not, fall through to random
                    pool = eligiblePool;
                }
                else
                {
                    var pick = _playQueue.Dequeue();
                    PlayVideo(pick);
                    return;
                }
            }
            else
            {
                // Direct random selection
                pool = GetEligiblePool();
            }

            if (pool.Length == 0)
            {
                StatusTextBlock.Text = OnlyFavoritesCheckBox.IsChecked == true
                    ? "No favorite videos in this folder."
                    : "No video files found in that folder.";
                return;
            }

            var randomPick = pool[_rng.Next(pool.Length)];
            PlayVideo(randomPick);
        }

        #endregion

        #region Loop Toggle

        private void LoopToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // Update the loop flag
            _isLoopEnabled = LoopToggle.IsChecked == true;
            
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

        private class ViewPreferences
        {
            public bool ShowMenu { get; set; } = true;
            public bool ShowFolderSelection { get; set; } = true;
            public bool ShowStatusLine { get; set; } = true;
            public bool ShowControls { get; set; } = true;
            public bool ShowBlacklistPanel { get; set; } = false;
            public bool ShowFavoritesPanel { get; set; } = false;
            public bool ShowRecentlyPlayedPanel { get; set; } = false;
            public bool ShowStatsPanel { get; set; } = false;
            public bool AlwaysOnTop { get; set; } = false;
            public bool IsPlayerViewMode { get; set; } = false;
            public bool RememberLastFolder { get; set; } = true;
            public string? LastFolderPath { get; set; } = null;
        }

        private void LoadViewPreferences()
        {
            try
            {
                var path = AppDataManager.GetViewPreferencesPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var prefs = JsonSerializer.Deserialize<ViewPreferences>(json);
                    if (prefs != null)
                    {
                        _showMenu = prefs.ShowMenu;
                        _showFolderSelection = prefs.ShowFolderSelection;
                        _showStatusLine = prefs.ShowStatusLine;
                        _showControls = prefs.ShowControls;
                        _showBlacklistPanel = prefs.ShowBlacklistPanel;
                        _showFavoritesPanel = prefs.ShowFavoritesPanel;
                        _showRecentlyPlayedPanel = prefs.ShowRecentlyPlayedPanel;
                        _showStatsPanel = prefs.ShowStatsPanel;
                        _alwaysOnTop = prefs.AlwaysOnTop;
                        _isPlayerViewMode = prefs.IsPlayerViewMode;
                        _rememberLastFolder = prefs.RememberLastFolder;
                        _lastFolderPath = prefs.LastFolderPath;
                    }
                }
                else
                {
                    // Default RememberLastFolder to true if file doesn't exist
                    _rememberLastFolder = true;
                }
            }
            catch
            {
                // ignore and keep defaults
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
            if (RememberLastFolderMenuItem != null)
            {
                RememberLastFolderMenuItem.IsChecked = _rememberLastFolder;
            }
            
            // If player view mode was saved as true, we need to:
            // 1. The loaded _show* values represent the state before entering player view mode
            // 2. Copy them to _saved* fields so we can restore them later
            // 3. Then apply player view mode (which will hide everything)
            if (_isPlayerViewMode)
            {
                _savedShowFolderSelection = _showFolderSelection;
                _savedShowStatusLine = _showStatusLine;
                _savedShowControls = _showControls;
                _savedShowBlacklistPanel = _showBlacklistPanel;
                _savedShowFavoritesPanel = _showFavoritesPanel;
                _savedShowRecentlyPlayedPanel = _showRecentlyPlayedPanel;
                _savedShowStatsPanel = _showStatsPanel;
                // Now ApplyPlayerViewMode will set _show* to false and hide everything
                ApplyPlayerViewMode();
            }
        }

        private void SaveViewPreferences()
        {
            try
            {
                var path = AppDataManager.GetViewPreferencesPath();
                // When in player view mode, save the saved state (what user wants when NOT in player view mode)
                // Otherwise, save the current state
                var prefs = new ViewPreferences
                {
                    ShowMenu = _showMenu,
                    ShowFolderSelection = _isPlayerViewMode ? _savedShowFolderSelection : _showFolderSelection,
                    ShowStatusLine = _isPlayerViewMode ? _savedShowStatusLine : _showStatusLine,
                    ShowControls = _isPlayerViewMode ? _savedShowControls : _showControls,
                    ShowBlacklistPanel = _isPlayerViewMode ? _savedShowBlacklistPanel : _showBlacklistPanel,
                    ShowFavoritesPanel = _isPlayerViewMode ? _savedShowFavoritesPanel : _showFavoritesPanel,
                    ShowRecentlyPlayedPanel = _isPlayerViewMode ? _savedShowRecentlyPlayedPanel : _showRecentlyPlayedPanel,
                    ShowStatsPanel = _isPlayerViewMode ? _savedShowStatsPanel : _showStatsPanel,
                    AlwaysOnTop = _alwaysOnTop,
                    IsPlayerViewMode = _isPlayerViewMode,
                    RememberLastFolder = _rememberLastFolder,
                    LastFolderPath = _lastFolderPath
                };
                var json = JsonSerializer.Serialize(prefs, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(path, json);
            }
            catch
            {
                // ignore save errors
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
                FolderRow.IsVisible = false;
                StatusLineGrid.IsVisible = false;
                ControlsRow.IsVisible = false;
                
                // Hide all panels
                if (MainContentGrid != null)
                {
                    var columns = MainContentGrid.ColumnDefinitions;
                    if (columns.Count >= 9)
                    {
                        BlacklistPanelContainer.IsVisible = false;
                        columns[0].Width = new GridLength(0);
                        BlacklistFavoritesSplitter.IsVisible = false;
                        columns[1].Width = new GridLength(0);
                        FavoritesPanelContainer.IsVisible = false;
                        columns[2].Width = new GridLength(0);
                        FavoritesVideoSplitter.IsVisible = false;
                        columns[3].Width = new GridLength(0);
                        // Column 4: Video View (always visible)
                        VideoRecentlyPlayedSplitter.IsVisible = false;
                        columns[5].Width = new GridLength(0);
                        RecentlyPlayedPanelContainer.IsVisible = false;
                        columns[6].Width = new GridLength(0);
                        StatsSplitter.IsVisible = false;
                        columns[7].Width = new GridLength(0);
                        StatsPanelContainer.IsVisible = false;
                        columns[8].Width = new GridLength(0);
                    }
                }
                
                // Update menu item checked states (but they won't be visible)
                ShowFolderMenuItem.IsChecked = false;
                ShowStatusMenuItem.IsChecked = false;
                ShowControlsMenuItem.IsChecked = false;
                ShowBlacklistMenuItem.IsChecked = false;
                ShowFavoritesMenuItem.IsChecked = false;
                ShowRecentlyPlayedMenuItem.IsChecked = false;
                ShowStatsMenuItem.IsChecked = false;
                
                return; // Exit early, don't apply normal visibility logic
            }
            
            // Normal view mode - show menu bar based on _showMenu
            if (MainMenu != null)
            {
                MainMenu.IsVisible = _showMenu;
            }
            
            FolderRow.IsVisible = _showFolderSelection;
            StatusLineGrid.IsVisible = _showStatusLine;
            ControlsRow.IsVisible = _showControls;
            
            // Show top border on MainContentGrid only when there's a visible row above it
            if (MainContentGridBorder != null)
            {
                bool hasVisibleRowAbove = _showFolderSelection || _showStatusLine || _showControls;
                MainContentGridBorder.BorderThickness = hasVisibleRowAbove ? new Avalonia.Thickness(0, 1, 0, 0) : new Avalonia.Thickness(0);
            }

            // Update panel visibility
            // Note: We need to set column widths to 0 when panels are hidden to properly collapse columns
            if (MainContentGrid != null)
            {
                var columns = MainContentGrid.ColumnDefinitions;
                if (columns.Count >= 9)
                {
                    // Column 0: Blacklist Panel
                    BlacklistPanelContainer.IsVisible = _showBlacklistPanel;
                    columns[0].Width = _showBlacklistPanel ? GridLength.Auto : new GridLength(0);
                    
                    // Column 1: Splitter between Blacklist and Favorites
                    BlacklistFavoritesSplitter.IsVisible = _showBlacklistPanel && _showFavoritesPanel;
                    columns[1].Width = (_showBlacklistPanel && _showFavoritesPanel) ? new GridLength(4) : new GridLength(0);

                    // Column 2: Favorites Panel
                    FavoritesPanelContainer.IsVisible = _showFavoritesPanel;
                    columns[2].Width = _showFavoritesPanel ? GridLength.Auto : new GridLength(0);
                    
                    // Column 3: Splitter between Favorites and Video
                    FavoritesVideoSplitter.IsVisible = _showFavoritesPanel;
                    columns[3].Width = _showFavoritesPanel ? new GridLength(4) : new GridLength(0);

                    // Column 4: Video View (always visible, star sized)
                    // No change needed

                    // Column 5: Splitter between Video and Recently Played
                    RecentlyPlayedPanelContainer.IsVisible = _showRecentlyPlayedPanel;
                    VideoRecentlyPlayedSplitter.IsVisible = _showRecentlyPlayedPanel;
                    columns[5].Width = _showRecentlyPlayedPanel ? new GridLength(4) : new GridLength(0);

                    // Column 6: Recently Played Panel
                    columns[6].Width = _showRecentlyPlayedPanel ? GridLength.Auto : new GridLength(0);

                    // Column 7: Splitter between Recently Played and Stats (always hidden since Stats is not resizable)
                    StatsSplitter.IsVisible = false;
                    columns[7].Width = new GridLength(0);

                    // Column 8: Stats Panel
                    StatsPanelContainer.IsVisible = _showStatsPanel;
                    columns[8].Width = _showStatsPanel ? GridLength.Auto : new GridLength(0);
                }
            }
            
            // Update border visibility to remove right borders when panels are last visible
            // Blacklist: no border if Favorites not visible
            if (BlacklistPanelContainer != null)
            {
                BlacklistPanelContainer.BorderThickness = new Avalonia.Thickness(0, 0, _showFavoritesPanel ? 1 : 0, 0);
            }
            // Favorites: no border if no panels to the right
            if (FavoritesPanelContainer != null)
            {
                FavoritesPanelContainer.BorderThickness = new Avalonia.Thickness(0, 0, (_showRecentlyPlayedPanel || _showStatsPanel) ? 1 : 0, 0);
            }
            // Recently Played: no border if Stats not visible
            if (RecentlyPlayedPanelContainer != null)
            {
                RecentlyPlayedPanelContainer.BorderThickness = new Avalonia.Thickness(0, 0, _showStatsPanel ? 1 : 0, 0);
            }
            // Stats panel is last, so no right border needed
            if (StatsPanelContainer != null)
            {
                StatsPanelContainer.BorderThickness = new Avalonia.Thickness(0);
            }

            // Update menu item checked states
            ShowMenuMenuItem.IsChecked = _showMenu;
            ShowFolderMenuItem.IsChecked = _showFolderSelection;
            ShowStatusMenuItem.IsChecked = _showStatusLine;
            ShowControlsMenuItem.IsChecked = _showControls;
            ShowBlacklistMenuItem.IsChecked = _showBlacklistPanel;
            ShowFavoritesMenuItem.IsChecked = _showFavoritesPanel;
            ShowRecentlyPlayedMenuItem.IsChecked = _showRecentlyPlayedPanel;
            ShowStatsMenuItem.IsChecked = _showStatsPanel;
        }

        private void ApplyPlayerViewMode()
        {
            if (_isPlayerViewMode)
            {
                // Entering player view mode - save current state
                _savedShowFolderSelection = _showFolderSelection;
                _savedShowStatusLine = _showStatusLine;
                _savedShowControls = _showControls;
                _savedShowBlacklistPanel = _showBlacklistPanel;
                _savedShowFavoritesPanel = _showFavoritesPanel;
                _savedShowRecentlyPlayedPanel = _showRecentlyPlayedPanel;
                _savedShowStatsPanel = _showStatsPanel;
                
                // Hide everything (ApplyViewPreferences will handle the actual hiding)
                // But we need to set flags to false so ApplyViewPreferences knows what to do
                _showFolderSelection = false;
                _showStatusLine = false;
                _showControls = false;
                _showBlacklistPanel = false;
                _showFavoritesPanel = false;
                _showRecentlyPlayedPanel = false;
                _showStatsPanel = false;
                
                // Update window size tracking for aspect ratio locking
                _lastWindowSize = new Size(this.Width, this.Height);
            }
            else
            {
                // Exiting player view mode - restore saved state
                _showFolderSelection = _savedShowFolderSelection;
                _showStatusLine = _savedShowStatusLine;
                _showControls = _savedShowControls;
                _showBlacklistPanel = _savedShowBlacklistPanel;
                _showFavoritesPanel = _savedShowFavoritesPanel;
                _showRecentlyPlayedPanel = _savedShowRecentlyPlayedPanel;
                _showStatsPanel = _savedShowStatsPanel;
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

        private async void Browse_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var options = new FolderPickerOpenOptions
            {
                Title = "Select video root folder"
            };

            var current = FolderTextBox.Text;
            if (!string.IsNullOrWhiteSpace(current) && Directory.Exists(current))
            {
                try
                {
                    var currentFolder = await StorageProvider.TryGetFolderFromPathAsync(current);
                    if (currentFolder != null)
                    {
                        options.SuggestedStartLocation = currentFolder;
                    }
                }
                catch
                {
                    // If we can't get the folder, just continue without suggested location
                }
            }

            var result = await StorageProvider.OpenFolderPickerAsync(options);
            if (result.Count > 0 && result[0] != null)
            {
                var path = result[0].Path.LocalPath;
                try
                {
                    FolderTextBox.Text = path;
                    StatusTextBlock.Text = $"Selected folder: {path}";
                    // Save last folder path if directory exists
                    if (Directory.Exists(path))
                    {
                        _lastFolderPath = path;
                        SaveViewPreferences();
                    }
                    RebuildPlayQueueIfNeeded();
                    // Start duration scan automatically
                    StartDurationScan(path);
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Error selecting folder: {ex.Message}";
                }
            }
        }

        private void PlayRandom_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // If Keep Playing is active, reset the timer
            if (_isKeepPlayingActive && _autoPlayTimer != null)
            {
                _autoPlayTimer.Stop();
                var intervalSeconds = (double)(IntervalNumericUpDown.Value ?? 60);
                _autoPlayTimer.Interval = intervalSeconds * 1000;
                _autoPlayTimer.Start();
            }

            PlayRandomVideo();
        }

        private void ShowCurrentVideoInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                StatusTextBlock.Text = "No video loaded.";
                return;
            }
            OpenFileLocation(_currentVideoPath);
        }

        private void KeepPlaying_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _isKeepPlayingActive = !_isKeepPlayingActive;
            KeepPlayingMenuItem.IsChecked = _isKeepPlayingActive;

            if (_isKeepPlayingActive)
            {
                // Enable Keep Playing
                KeepPlayingButton.Content = "Stop Playing";
                
                // Disable the interval control while active
                IntervalNumericUpDown.IsEnabled = false;

                // Play a video immediately
                PlayRandomVideo();

                // Start the timer
                var intervalSeconds = (double)(IntervalNumericUpDown.Value ?? 60);
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
                // Use Avalonia's dispatcher to ensure UI updates happen on the UI thread
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    PlayRandomVideo();
                });
            }
        }

        private void BlacklistCurrentVideo_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // Toggle button now drives this; keep for safety if invoked elsewhere
            BlacklistToggle.IsChecked = true;
        }


        private void ShowMenuMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showMenu = ShowMenuMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
        }

        private void ShowFolderMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showFolderSelection = ShowFolderMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
        }

        private void ShowStatusMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showStatusLine = ShowStatusMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
        }

        private void ShowControlsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showControls = ShowControlsMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
        }

        private void ShowBlacklistMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showBlacklistPanel = ShowBlacklistMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
            if (_showBlacklistPanel)
            {
                UpdateBlacklistUI();
            }
        }

        private void ShowFavoritesMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showFavoritesPanel = ShowFavoritesMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
            if (_showFavoritesPanel)
            {
                UpdateFavoritesUI();
            }
        }

        private void ShowRecentlyPlayedMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showRecentlyPlayedPanel = ShowRecentlyPlayedMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
        }

        private void ShowStatsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showStatsPanel = ShowStatsMenuItem.IsChecked == true;
            SaveViewPreferences();
            ApplyViewPreferences();
        }

        private async void ClearPlaybackStats_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
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
                _playbackStats.Clear();
                SavePlaybackStats();
                RecalculateGlobalStats();
                UpdateCurrentVideoStatsUi();
                StatusTextBlock.Text = "Playback stats cleared.";
            }
        }

        private void FullscreenMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            IsFullScreen = FullscreenMenuItem.IsChecked == true;
        }

        private void RememberLastFolderMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _rememberLastFolder = RememberLastFolderMenuItem.IsChecked == true;
            SaveViewPreferences();
        }

        private void AlwaysOnTopMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _alwaysOnTop = AlwaysOnTopMenuItem.IsChecked == true;
            this.Topmost = _alwaysOnTop;
            SaveViewPreferences();
        }

        private void PlayerViewModeMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _isPlayerViewMode = PlayerViewModeMenuItem.IsChecked == true;
            ApplyPlayerViewMode();
            SaveViewPreferences();
        }

        private bool IsFullScreen
        {
            get => _isFullScreen;
            set
            {
                if (_isFullScreen != value)
                {
                    _isFullScreen = value;
                    ToggleFullScreen(_isFullScreen);
                    FullscreenMenuItem.IsChecked = _isFullScreen;
                }
            }
        }

        private void ToggleFullScreen(bool enable)
        {
            if (enable)
            {
                // Enter fullscreen
                this.WindowState = WindowState.FullScreen;
            }
            else
            {
                // Leave fullscreen; restore to normal windowed state
                if (this.WindowState == WindowState.FullScreen)
                    this.WindowState = WindowState.Normal;
            }
        }

        private void AutoPlayNext_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _autoPlayNext = AutoPlayNextCheckBox.IsChecked == true;
            AutoPlayNextMenuItem.IsChecked = _autoPlayNext;
        }

        private void ScanDurations_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var root = FolderTextBox.Text?.Trim();
            if (!string.IsNullOrEmpty(root) && Directory.Exists(root))
            {
                StatusTextBlock.Text = "Starting duration scan...";
                StartDurationScan(root);
            }
            else
            {
                StatusTextBlock.Text = "Please select a folder first.";
            }
        }

        private void ScanLoudness_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var root = FolderTextBox.Text?.Trim();
            if (!string.IsNullOrEmpty(root) && Directory.Exists(root))
            {
                StatusTextBlock.Text = "Starting loudness scan...";
                StartLoudnessScan(root);
            }
            else
            {
                StatusTextBlock.Text = "Please select a folder first.";
            }
        }

        private void VolumeNormalizationMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is MenuItem item)
            {
                // Uncheck all volume normalization items
                VolumeNormalizationOffMenuItem.IsChecked = false;
                VolumeNormalizationSimpleMenuItem.IsChecked = false;
                VolumeNormalizationLibraryAwareMenuItem.IsChecked = false;

                // Check the clicked item
                item.IsChecked = true;

                // Determine selected mode
                VolumeNormalizationMode newMode = VolumeNormalizationMode.Off;
                if (item == VolumeNormalizationOffMenuItem)
                {
                    newMode = VolumeNormalizationMode.Off;
                }
                else if (item == VolumeNormalizationSimpleMenuItem)
                {
                    newMode = VolumeNormalizationMode.Simple;
                }
                else if (item == VolumeNormalizationLibraryAwareMenuItem)
                {
                    newMode = VolumeNormalizationMode.LibraryAware;
                }

                // Update mode
                _volumeNormalizationMode = newMode;
                SavePlaybackSettings("Volume normalization");

                // Apply to current media if playing
                if (_currentMedia != null && _mediaPlayer != null && !string.IsNullOrEmpty(_currentVideoPath))
                {
                    ApplyVolumeNormalization();
                }
            }
        }

        private void DurationFilter_Changed(object? sender, Avalonia.Controls.SelectionChangedEventArgs e)
        {
            ApplyDurationFilterChanges();
            SavePlaybackSettings("Duration filter");
        }

        #endregion

        #region Menu helpers

        private void SyncMenuStates()
        {
            NoRepeatMenuItem.IsChecked = _noRepeatMode;
            KeepPlayingMenuItem.IsChecked = _isKeepPlayingActive;
            AutoPlayNextMenuItem.IsChecked = _autoPlayNext;
            OnlyFavoritesMenuItem.IsChecked = OnlyFavoritesCheckBox.IsChecked == true;
            FavoriteToggle.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
            BlacklistToggle.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
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

        private void AutoPlayNextMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            AutoPlayNextCheckBox.IsChecked = AutoPlayNextMenuItem.IsChecked;
        }

        private void OnlyFavoritesMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            OnlyFavoritesCheckBox.IsChecked = OnlyFavoritesMenuItem.IsChecked;
        }

        private async void DurationFilterMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            await ShowDurationFilterDialogAsync();
        }

        private void BlacklistToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                BlacklistToggle.IsChecked = false;
                BlacklistToggle.IsEnabled = false;
                return;
            }

            var path = _currentVideoPath;
            if (BlacklistToggle.IsChecked == true)
            {
                _blacklist.Add(path);
                SaveBlacklist();

                // Remove from queue if present
                var queueList = _playQueue.ToList();
                queueList.Remove(path);
                _playQueue = new Queue<string>(queueList);

                RebuildPlayQueueIfNeeded();
                StatusTextBlock.Text = $"Blacklisted: {System.IO.Path.GetFileName(path)}";
            }
            else
            {
                _blacklist.Remove(path);
                SaveBlacklist();
                RebuildPlayQueueIfNeeded();
                UpdateBlacklistUI();
                StatusTextBlock.Text = $"Removed from blacklist: {System.IO.Path.GetFileName(path)}";
            }
        }

        private async Task ShowDurationFilterDialogAsync()
        {
            var dialog = new Window
            {
                Title = "Duration filter",
                Width = 320,
                Height = 200,
                CanResize = false,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var minCombo = BuildDurationCombo(isMin: true);
            var maxCombo = BuildDurationCombo(isMin: false);

            // initialize selections from hidden combos
            minCombo.SelectedItem = FindMatchingDurationItem(minCombo, GetComboContent(MinDurationComboBox));
            maxCombo.SelectedItem = FindMatchingDurationItem(maxCombo, GetComboContent(MaxDurationComboBox));

            var ok = new Button { Content = "OK", MinWidth = 80, Margin = new Thickness(0, 0, 8, 0) };
            var cancel = new Button { Content = "Cancel", MinWidth = 80 };

            ok.Click += (_, __) =>
            {
                SetComboSelectionByContent(MinDurationComboBox, GetComboContent(minCombo));
                SetComboSelectionByContent(MaxDurationComboBox, GetComboContent(maxCombo));
                dialog.Close(true);
                ApplyDurationFilterChanges();
                SavePlaybackSettings("Duration filter");
            };
            cancel.Click += (_, __) => dialog.Close(false);

            dialog.Content = new StackPanel
            {
                Margin = new Thickness(12),
                Spacing = 8,
                Children =
                {
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        Spacing = 8,
                        Children =
                        {
                            new TextBlock { Text = "Min:", VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center },
                            minCombo
                        }
                    },
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        Spacing = 8,
                        Children =
                        {
                            new TextBlock { Text = "Max:", VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center },
                            maxCombo
                        }
                    },
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                        Spacing = 8,
                        Children = { ok, cancel }
                    }
                }
            };

            await dialog.ShowDialog<bool?>(this);
        }

        private ComboBox BuildDurationCombo(bool isMin)
        {
            var combo = new ComboBox
            {
                Width = 120
            };

            var shared = new[]
            {
                "5s",
                "10s",
                "30s",
                "1m",
                "2m",
                "5m",
                "10m",
                "15m",
                "30m"
            };

            var options = new List<string>();
            if (isMin)
            {
                options.Add("No Minimum");
            }
            else
            {
                options.Add("No Maximum");
            }
            options.AddRange(shared);

            foreach (var opt in options)
            {
                combo.Items.Add(new ComboBoxItem { Content = opt });
            }

            combo.SelectedIndex = 0;
            return combo;
        }

        private string GetComboContent(ComboBox combo)
        {
            return (combo.SelectedItem as ComboBoxItem)?.Content?.ToString()
                   ?? combo.SelectedItem?.ToString()
                   ?? "No Minimum";
        }

        private object? FindMatchingDurationItem(ComboBox combo, string content)
        {
            foreach (var item in combo.Items)
            {
                if (item is ComboBoxItem cbi && cbi.Content?.ToString() == content)
                    return item;
                if (item?.ToString() == content)
                    return item;
            }
            return combo.Items.FirstOrDefault();
        }

        private void SetComboSelectionByContent(ComboBox combo, string content)
        {
            var match = FindMatchingDurationItem(combo, content);
            if (match != null)
            {
                combo.SelectedItem = match;
            }
        }

        private void ApplyDurationFilterChanges()
        {
            // Rebuild queue with new filters
            RebuildPlayQueueIfNeeded();

            // Trigger scan if cache is empty and filters are active
            var currentRoot = FolderTextBox.Text?.Trim();
            if (!string.IsNullOrEmpty(currentRoot) && Directory.Exists(currentRoot))
            {
                lock (_durationCache)
                {
                    if (_durationCache.Count == 0 && _scanCancellationSource == null)
                    {
                        var minDuration = ParseDurationFilter(MinDurationComboBox.SelectedItem);
                        var maxDuration = ParseDurationFilter(MaxDurationComboBox.SelectedItem);

                        if (minDuration.HasValue || maxDuration.HasValue)
                        {
                            StatusTextBlock.Text = "Duration filters active, starting scan...";
                            StartDurationScan(currentRoot);
                        }
                    }
                }
            }
        }

        #endregion

        #region UI sync

        private void UpdatePerVideoToggleStates()
        {
            var hasVideo = !string.IsNullOrEmpty(_currentVideoPath);
            FavoriteToggle.IsEnabled = hasVideo;
            BlacklistToggle.IsEnabled = hasVideo;
            ShowInFileManagerButton.IsEnabled = hasVideo;

            if (!hasVideo)
            {
                FavoriteToggle.IsChecked = false;
                BlacklistToggle.IsChecked = false;
                return;
            }

            FavoriteToggle.IsChecked = _favorites.Contains(_currentVideoPath!);
            BlacklistToggle.IsChecked = _blacklist.Contains(_currentVideoPath!);
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

        private void ApplyVolumeNormalization()
        {
            if (_currentMedia == null || _mediaPlayer == null || string.IsNullOrEmpty(_currentVideoPath))
                return;

            // If mode is Off: do NOT add audio filter, use slider value directly
            if (_volumeNormalizationMode == VolumeNormalizationMode.Off)
            {
                _mediaPlayer.Volume = _userVolumePreference;
                return;
            }

            // If mode is Simple or LibraryAware: add audio filter (only once per media creation)
            if (_volumeNormalizationMode == VolumeNormalizationMode.Simple || _volumeNormalizationMode == VolumeNormalizationMode.LibraryAware)
            {
                // Add the audio filter only one time per media creation
                // Use normvol filter for gentle real-time normalization
                _currentMedia.AddOption(":audio-filter=normvol");
                // Optional: conservative preamp (0.0 = no additional boost)
                _currentMedia.AddOption(":normvol-preamp=0.0");
            }

            // If mode is LibraryAware: apply per-file gain adjustment
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware)
            {
                FileLoudnessInfo? info = null;
                lock (_loudnessStats)
                {
                    _loudnessStats.TryGetValue(_currentVideoPath, out info);
                }

                if (info != null)
                {
                    // Use named constants: TargetLoudnessDb and MaxGainDb
                    // Calculate gain: diffDb = TargetLoudnessDb - info.MeanVolumeDb
                    var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
                    // Clamp: diffDb = Math.Clamp(diffDb, -MaxGainDb, +MaxGainDb)
                    diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
                    // Convert to linear: gainLinear = Math.Pow(10.0, diffDb / 20.0)
                    var gainLinear = Math.Pow(10.0, diffDb / 20.0);
                    // Apply: sliderLinear = _userVolumePreference / 100.0, normalizedLinear = sliderLinear * gainLinear
                    var sliderLinear = _userVolumePreference / 100.0;
                    var normalizedLinear = sliderLinear * gainLinear;
                    // Clamp to LibVLC range [0, 200]: normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0)
                    normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
                    // Convert back: finalVolume = (int)Math.Round(normalizedLinear * 100.0)
                    var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
                    // Ensure final volume is clamped to [0, 200]
                    finalVolume = Math.Clamp(finalVolume, 0, 200);
                    // Set MediaPlayer volume
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    // Fall back to Simple mode behavior (real-time filter only)
                    _mediaPlayer.Volume = _userVolumePreference;
                }
            }
            else
            {
                // Simple mode: use slider value with real-time filter
                _mediaPlayer.Volume = _userVolumePreference;
            }
        }

        private void VolumeSlider_ValueChanged(object? sender, Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs e)
        {
            if (_mediaPlayer == null)
                return;

            var newVolume = (int)VolumeSlider.Value;
            _userVolumePreference = newVolume;

            // If mode is LibraryAware and current video exists, recalculate normalized volume
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware && !string.IsNullOrEmpty(_currentVideoPath))
            {
                FileLoudnessInfo? info = null;
                lock (_loudnessStats)
                {
                    _loudnessStats.TryGetValue(_currentVideoPath, out info);
                }

                if (info != null)
                {
                    // Recalculate normalized volume using current loudness data
                    var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
                    diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
                    var gainLinear = Math.Pow(10.0, diffDb / 20.0);
                    var sliderLinear = _userVolumePreference / 100.0;
                    var normalizedLinear = sliderLinear * gainLinear;
                    normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
                    var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
                    finalVolume = Math.Clamp(finalVolume, 0, 200);
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    // Fall back to direct volume
                    _mediaPlayer.Volume = newVolume;
                }
            }
            else
            {
                // Off or Simple mode: set volume directly
                _mediaPlayer.Volume = newVolume;
            }

            // Update mute button state
            if (newVolume == 0)
            {
                MuteButton.IsChecked = true;
            }
            else
            {
                MuteButton.IsChecked = false;
                _lastNonZeroVolume = newVolume;
            }
            
            UpdateVolumeTooltip();
        }

        private void MuteButton_Checked(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_mediaPlayer == null)
                return;

            // Mute: save current volume and set to 0
            if (_mediaPlayer.Volume > 0)
            {
                _lastNonZeroVolume = _mediaPlayer.Volume;
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
            
            // Reapply normalization if in Library-aware mode
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware && !string.IsNullOrEmpty(_currentVideoPath))
            {
                FileLoudnessInfo? info = null;
                lock (_loudnessStats)
                {
                    _loudnessStats.TryGetValue(_currentVideoPath, out info);
                }

                if (info != null)
                {
                    var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
                    diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
                    var gainLinear = Math.Pow(10.0, diffDb / 20.0);
                    var sliderLinear = _userVolumePreference / 100.0;
                    var normalizedLinear = sliderLinear * gainLinear;
                    normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
                    var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
                    finalVolume = Math.Clamp(finalVolume, 0, 200);
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
            if (_mediaPlayer == null)
                return;

            if (deltaY == 0)
                return;

            // Update user preference (slider value)
            var newPreference = _userVolumePreference + (deltaY > 0 ? _volumeStep : -_volumeStep);
            newPreference = Math.Max(0, Math.Min(200, newPreference)); // Clamp to [0, 200]
            _userVolumePreference = newPreference;
            VolumeSlider.Value = newPreference;

            // Apply normalization if in Library-aware mode
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware && !string.IsNullOrEmpty(_currentVideoPath))
            {
                FileLoudnessInfo? info = null;
                lock (_loudnessStats)
                {
                    _loudnessStats.TryGetValue(_currentVideoPath, out info);
                }

                if (info != null)
                {
                    var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
                    diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
                    var gainLinear = Math.Pow(10.0, diffDb / 20.0);
                    var sliderLinear = _userVolumePreference / 100.0;
                    var normalizedLinear = sliderLinear * gainLinear;
                    normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
                    var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
                    finalVolume = Math.Clamp(finalVolume, 0, 200);
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

        private void OnGlobalKeyDown(object? sender, KeyEventArgs e)
        {
            // F11 should work even when TextBox has focus, so handle it first
            if (e.Key == Key.F11)
            {
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
                    HandlePlayPauseShortcut();
                    e.Handled = true;
                    break;

                case Key.J:
                    HandleSeekBackwardShortcut();
                    e.Handled = true;
                    break;

                case Key.L:
                    HandleSeekForwardShortcut();
                    e.Handled = true;
                    break;

                case Key.R:
                    HandleRandomShortcut(); // same as 🎲 button
                    e.Handled = true;
                    break;

                case Key.Left:
                    HandlePreviousShortcut(); // same as ⏮ button
                    e.Handled = true;
                    break;

                case Key.Right:
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
                    SaveViewPreferences();
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
                    SaveViewPreferences();
                    e.Handled = true;
                    break;

                case Key.D1: // Number 1 - Show Menu
                    ToggleViewPreference(ref _showMenu, ShowMenuMenuItem);
                    e.Handled = true;
                    break;

                case Key.D2: // Number 2 - Show Folder Selection
                    ToggleViewPreference(ref _showFolderSelection, ShowFolderMenuItem);
                    e.Handled = true;
                    break;

                case Key.D3: // Number 3 - Show Status Line
                    ToggleViewPreference(ref _showStatusLine, ShowStatusMenuItem);
                    e.Handled = true;
                    break;

                case Key.D4: // Number 4 - Show Controls
                    ToggleViewPreference(ref _showControls, ShowControlsMenuItem);
                    e.Handled = true;
                    break;

                case Key.D5: // Number 5 - Show Blacklist panel
                    ToggleViewPreference(ref _showBlacklistPanel, ShowBlacklistMenuItem);
                    if (_showBlacklistPanel)
                    {
                        UpdateBlacklistUI();
                    }
                    e.Handled = true;
                    break;

                case Key.D6: // Number 6 - Show Favorites panel
                    ToggleViewPreference(ref _showFavoritesPanel, ShowFavoritesMenuItem);
                    if (_showFavoritesPanel)
                    {
                        UpdateFavoritesUI();
                    }
                    e.Handled = true;
                    break;

                case Key.D7: // Number 7 - Show Recently Played
                    ToggleViewPreference(ref _showRecentlyPlayedPanel, ShowRecentlyPlayedMenuItem);
                    e.Handled = true;
                    break;

                case Key.D8: // Number 8 - Show Stats panel
                    ToggleViewPreference(ref _showStatsPanel, ShowStatsMenuItem);
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
            SaveViewPreferences();
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
            Browse_Click(this, new RoutedEventArgs());
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
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware && !string.IsNullOrEmpty(_currentVideoPath))
            {
                FileLoudnessInfo? info = null;
                lock (_loudnessStats)
                {
                    _loudnessStats.TryGetValue(_currentVideoPath, out info);
                }

                if (info != null)
                {
                    var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
                    diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
                    var gainLinear = Math.Pow(10.0, diffDb / 20.0);
                    var sliderLinear = _userVolumePreference / 100.0;
                    var normalizedLinear = sliderLinear * gainLinear;
                    normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
                    var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
                    finalVolume = Math.Clamp(finalVolume, 0, 200);
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
            if (_volumeNormalizationMode == VolumeNormalizationMode.LibraryAware && !string.IsNullOrEmpty(_currentVideoPath))
            {
                FileLoudnessInfo? info = null;
                lock (_loudnessStats)
                {
                    _loudnessStats.TryGetValue(_currentVideoPath, out info);
                }

                if (info != null)
                {
                    var diffDb = TargetLoudnessDb - info.MeanVolumeDb;
                    diffDb = Math.Clamp(diffDb, -MaxGainDb, MaxGainDb);
                    var gainLinear = Math.Pow(10.0, diffDb / 20.0);
                    var sliderLinear = _userVolumePreference / 100.0;
                    var normalizedLinear = sliderLinear * gainLinear;
                    normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
                    var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
                    finalVolume = Math.Clamp(finalVolume, 0, 200);
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
            if (_mediaPlayer == null)
                return;

            // If no media loaded, try to play random
            if (_currentMedia == null)
            {
                PlayRandomVideo();
                return;
            }

            // Decide based purely on the actual player state
            if (_mediaPlayer.IsPlaying)
            {
                _mediaPlayer.Pause();
            }
            else
            {
                // Only try to play if there is already media loaded
                if (_mediaPlayer.Media != null)
                {
                    _mediaPlayer.Play();
                }
            }
            // Note: Button state (IsChecked) is updated by MediaPlayer Playing/Paused/Stopped events
        }

        private void SeekForward()
        {
            if (_mediaPlayer == null || _currentMedia == null)
                return;

            if (_seekStep == "Frame")
            {
                // Frame step forward - pause first if playing, then step frame
                if (_mediaPlayer.IsPlaying)
                {
                    _mediaPlayer.Pause();
                    PlayPauseButton.IsChecked = false;
                }
                _mediaPlayer.NextFrame();
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
                    _mediaPlayer.Time = newTime;
                    // Timer will update slider and status time
                }
            }
        }

        private void SeekBackward()
        {
            if (_mediaPlayer == null || _currentMedia == null)
                return;

            if (_seekStep == "Frame")
            {
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
                    _mediaPlayer.Time = newTime;
                    // Timer will update slider and status time
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

        private void LoadPlaybackSettings()
        {
            try
            {
                var path = AppDataManager.GetPlaybackSettingsPath();
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var settings = JsonSerializer.Deserialize<PlaybackSettings>(json);
                    if (settings != null)
                    {
                        _seekStep = settings.SeekStep ?? "5s";
                        _volumeStep = settings.VolumeStep > 0 ? settings.VolumeStep : 5;
                        
                        // Load duration filter settings
                        if (!string.IsNullOrEmpty(settings.MinDuration))
                        {
                            SetComboSelectionByContent(MinDurationComboBox, settings.MinDuration);
                        }
                        if (!string.IsNullOrEmpty(settings.MaxDuration))
                        {
                            SetComboSelectionByContent(MaxDurationComboBox, settings.MaxDuration);
                        }
                        
                        // Load interval setting
                        if (settings.IntervalSeconds.HasValue && settings.IntervalSeconds.Value >= 1 && settings.IntervalSeconds.Value <= 3600)
                        {
                            IntervalNumericUpDown.Value = (decimal)settings.IntervalSeconds.Value;
                        }

                        // Load volume normalization mode
                        _volumeNormalizationMode = settings.VolumeNormalizationMode;
                    }
                }
            }
            catch
            {
                // Use defaults
            }

            // Sync menu states
            SeekStepFrameMenuItem.IsChecked = _seekStep == "Frame";
            SeekStep1sMenuItem.IsChecked = _seekStep == "1s";
            SeekStep5sMenuItem.IsChecked = _seekStep == "5s";
            SeekStep10sMenuItem.IsChecked = _seekStep == "10s";

            VolumeStep1MenuItem.IsChecked = _volumeStep == 1;
            VolumeStep2MenuItem.IsChecked = _volumeStep == 2;
            VolumeStep5MenuItem.IsChecked = _volumeStep == 5;

            // Sync volume normalization menu states
            VolumeNormalizationOffMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.Off;
            VolumeNormalizationSimpleMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.Simple;
            VolumeNormalizationLibraryAwareMenuItem.IsChecked = _volumeNormalizationMode == VolumeNormalizationMode.LibraryAware;
        }

        private void SavePlaybackSettings(params string[] changedSettings)
        {
            try
            {
                var path = AppDataManager.GetPlaybackSettingsPath();
                var settings = new PlaybackSettings
                {
                    SeekStep = _seekStep,
                    VolumeStep = _volumeStep,
                    MinDuration = GetComboContent(MinDurationComboBox),
                    MaxDuration = GetComboContent(MaxDurationComboBox),
                    IntervalSeconds = IntervalNumericUpDown.Value.HasValue ? (double?)IntervalNumericUpDown.Value.Value : null,
                    VolumeNormalizationMode = _volumeNormalizationMode
                };
                var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(path, json);
                
                // Show status message if settings were changed
                if (changedSettings != null && changedSettings.Length > 0)
                {
                    var settingsList = string.Join(", ", changedSettings);
                    StatusTextBlock.Text = $"Settings updated: {settingsList}";
                }
            }
            catch
            {
                // Silently fail
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
