using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace ReelRoulette
{
    public partial class FilterDialog : Window, INotifyPropertyChanged
    {
        private FilterState _originalFilterState;
        private FilterState _filterState;
        private LibraryIndex? _libraryIndex;
        private bool _applyClicked = false;
        
        // Filter presets
        private List<FilterPreset> _presets = new List<FilterPreset>();
        private string? _activePresetName;
        private const string NonePresetName = "None";
        private bool _presetModified = false; // Track if current preset has been modified
        private PixelPoint? _savedPosition; // Store position to set after window opens
        private FilterState? _originalPresetState = null; // Store original preset state when loaded
        private bool _isInitializing = false; // Flag to suppress SelectionChanged during initialization

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public FilterDialog(FilterState filterState, LibraryIndex? libraryIndex, 
                           List<FilterPreset>? presets = null, string? activePresetName = null)
        {
            InitializeComponent();
            _originalFilterState = filterState ?? new FilterState();
            
            // Create a working copy to avoid modifying the original until Apply is clicked
            var json = JsonSerializer.Serialize(_originalFilterState);
            _filterState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            
            _libraryIndex = libraryIndex;
            
            // Create deep copy of presets list to prevent modifications from persisting on Cancel
            if (presets != null && presets.Count > 0)
            {
                _presets = new List<FilterPreset>();
                foreach (var preset in presets)
                {
                    var presetJson = JsonSerializer.Serialize(preset);
                    var presetCopy = JsonSerializer.Deserialize<FilterPreset>(presetJson);
                    if (presetCopy != null)
                    {
                        _presets.Add(presetCopy);
                    }
                }
            }
            else
            {
                _presets = new List<FilterPreset>();
            }
            
            _activePresetName = activePresetName;
            
            // Load saved dialog bounds
            var (x, y, width, height) = MainWindow.LoadDialogBounds("FilterDialog");
            
            if (x.HasValue && y.HasValue)
            {
                // Store position to set after window opens (Avalonia best practice)
                _savedPosition = new PixelPoint((int)x.Value, (int)y.Value);
                Log($"FilterDialog: Will restore position to ({x.Value}, {y.Value}) after window opens");
            }
            else
            {
                // No saved position - center on owner window
                WindowStartupLocation = WindowStartupLocation.CenterOwner;
                Log("FilterDialog: No saved position, centering on owner");
            }
            
            if (width.HasValue && width.Value > 0)
            {
                Width = width.Value;
                Log($"FilterDialog: Restored width to {width.Value}");
            }
            
            if (height.HasValue && height.Value > 0)
            {
                Height = height.Value;
                Log($"FilterDialog: Restored height to {height.Value}");
            }

            // Subscribe to window events
            Opened += OnDialogOpened;
            Closing += OnDialogClosing;
            
            DataContext = this;
            
            // Suppress SelectionChanged event during initialization to prevent overwriting passed-in filter state
            _isInitializing = true;
            try
            {
                // Load presets into UI (this may trigger SelectionChanged, but we suppress it)
                LoadPresets();
                UpdateTagSelectionState();
                OnPropertyChanged(nameof(HeaderText));
            }
            finally
            {
                _isInitializing = false;
            }
            
            // If we have an active preset name, set _originalPresetState manually since SelectionChanged was suppressed
            if (!string.IsNullOrEmpty(_activePresetName))
            {
                var preset = _presets.FirstOrDefault(p => p.Name == _activePresetName);
                if (preset != null)
                {
                    var presetJson = JsonSerializer.Serialize(preset.FilterState);
                    _originalPresetState = JsonSerializer.Deserialize<FilterState>(presetJson) ?? new FilterState();
                    Log($"FilterDialog: Set _originalPresetState for active preset '{_activePresetName}' during initialization");
                }
            }
            
            Log($"FilterDialog: Initialized with {_presets.Count} presets, active preset: {_activePresetName ?? "None"}");
        }

        public FilterState FilterState => _filterState;

        // Preset-related properties
        public ObservableCollection<string> PresetNames { get; } = new ObservableCollection<string>();
        public ObservableCollection<FilterPreset> Presets { get; } = new ObservableCollection<FilterPreset>();

        private string? _selectedPresetName;
        public string? SelectedPresetName
        {
            get => _selectedPresetName;
            set
            {
                _selectedPresetName = value;
                OnPropertyChanged();
            }
        }

        /// <summary>
        /// Header text that shows active preset name if one is selected, with "*" if modified.
        /// </summary>
        public string HeaderText
        {
            get
            {
                if (!string.IsNullOrEmpty(_activePresetName))
                {
                    var modifiedMarker = _presetModified ? "*" : "";
                    return $"Configure Filters - Active Preset: {_activePresetName}{modifiedMarker}";
                }
                return "Configure Filters";
            }
        }

        /// <summary>
        /// Returns true if a preset is selected and has been modified, enabling the Update Preset button.
        /// </summary>
        public bool CanUpdatePreset => !string.IsNullOrEmpty(_activePresetName) && _presetModified;

        // Basic flags
        public bool FavoritesOnly
        {
            get => _filterState.FavoritesOnly;
            set
            {
                _filterState.FavoritesOnly = value;
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        public bool ExcludeBlacklisted
        {
            get => _filterState.ExcludeBlacklisted;
            set
            {
                _filterState.ExcludeBlacklisted = value;
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        public bool OnlyNeverPlayed
        {
            get => _filterState.OnlyNeverPlayed;
            set
            {
                _filterState.OnlyNeverPlayed = value;
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        public bool OnlyKnownDuration
        {
            get => _filterState.OnlyKnownDuration;
            set
            {
                _filterState.OnlyKnownDuration = value;
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        public bool OnlyKnownLoudness
        {
            get => _filterState.OnlyKnownLoudness;
            set
            {
                _filterState.OnlyKnownLoudness = value;
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        // Media type filter
        public bool MediaTypeAll
        {
            get => _filterState.MediaTypeFilter == MediaTypeFilter.All;
            set
            {
                if (value)
                {
                    Log($"FilterDialog: Media type filter changed to All (Videos and Photos)");
                    _filterState.MediaTypeFilter = MediaTypeFilter.All;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(MediaTypeVideosOnly));
                    OnPropertyChanged(nameof(MediaTypePhotosOnly));
                    MarkPresetModified();
                }
            }
        }

        public bool MediaTypeVideosOnly
        {
            get => _filterState.MediaTypeFilter == MediaTypeFilter.VideosOnly;
            set
            {
                if (value)
                {
                    Log($"FilterDialog: Media type filter changed to Videos Only");
                    _filterState.MediaTypeFilter = MediaTypeFilter.VideosOnly;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(MediaTypeAll));
                    OnPropertyChanged(nameof(MediaTypePhotosOnly));
                    MarkPresetModified();
                }
            }
        }

        public bool MediaTypePhotosOnly
        {
            get => _filterState.MediaTypeFilter == MediaTypeFilter.PhotosOnly;
            set
            {
                if (value)
                {
                    Log($"FilterDialog: Media type filter changed to Photos Only");
                    _filterState.MediaTypeFilter = MediaTypeFilter.PhotosOnly;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(MediaTypeAll));
                    OnPropertyChanged(nameof(MediaTypeVideosOnly));
                    MarkPresetModified();
                }
            }
        }

        // Audio filter
        public bool AudioFilterAll
        {
            get => _filterState.AudioFilter == AudioFilterMode.PlayAll;
            set
            {
                if (value)
                {
                    _filterState.AudioFilter = AudioFilterMode.PlayAll;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(AudioFilterWithAudio));
                    OnPropertyChanged(nameof(AudioFilterWithoutAudio));
                    MarkPresetModified();
                }
            }
        }

        public bool AudioFilterWithAudio
        {
            get => _filterState.AudioFilter == AudioFilterMode.WithAudioOnly;
            set
            {
                if (value)
                {
                    _filterState.AudioFilter = AudioFilterMode.WithAudioOnly;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(AudioFilterAll));
                    OnPropertyChanged(nameof(AudioFilterWithoutAudio));
                    MarkPresetModified();
                }
            }
        }

        public bool AudioFilterWithoutAudio
        {
            get => _filterState.AudioFilter == AudioFilterMode.WithoutAudioOnly;
            set
            {
                if (value)
                {
                    _filterState.AudioFilter = AudioFilterMode.WithoutAudioOnly;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(AudioFilterAll));
                    OnPropertyChanged(nameof(AudioFilterWithAudio));
                    MarkPresetModified();
                }
            }
        }

        // Duration
        public bool NoMinDuration
        {
            get => !_filterState.MinDuration.HasValue;
            set
            {
                if (value)
                {
                    _filterState.MinDuration = null;
                    MinDurationText = string.Empty;
                }
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        public bool NoMaxDuration
        {
            get => !_filterState.MaxDuration.HasValue;
            set
            {
                if (value)
                {
                    _filterState.MaxDuration = null;
                    MaxDurationText = string.Empty;
                }
                OnPropertyChanged();
                MarkPresetModified();
            }
        }

        private string _minDurationText = string.Empty;
        public string MinDurationText
        {
            get
            {
                if (_filterState.MinDuration.HasValue)
                {
                    return FormatTimeSpan(_filterState.MinDuration.Value);
                }
                return _minDurationText;
            }
            set
            {
                _minDurationText = value;
                if (string.IsNullOrWhiteSpace(value))
                {
                    _filterState.MinDuration = null;
                }
                else
                {
                    var parsed = ParseTimeSpan(value);
                    if (parsed.HasValue)
                    {
                        _filterState.MinDuration = parsed;
                    }
                }
                OnPropertyChanged();
                OnPropertyChanged(nameof(NoMinDuration));
                MarkPresetModified();
            }
        }

        private string _maxDurationText = string.Empty;
        public string MaxDurationText
        {
            get
            {
                if (_filterState.MaxDuration.HasValue)
                {
                    return FormatTimeSpan(_filterState.MaxDuration.Value);
                }
                return _maxDurationText;
            }
            set
            {
                _maxDurationText = value;
                if (string.IsNullOrWhiteSpace(value))
                {
                    _filterState.MaxDuration = null;
                }
                else
                {
                    var parsed = ParseTimeSpan(value);
                    if (parsed.HasValue)
                    {
                        _filterState.MaxDuration = parsed;
                    }
                }
                OnPropertyChanged();
                OnPropertyChanged(nameof(NoMaxDuration));
                MarkPresetModified();
            }
        }

        // Tags (legacy - kept for compatibility)
        public ObservableCollection<FilterTagViewModel> AvailableTags { get; } = new ObservableCollection<FilterTagViewModel>();

        // Tags by Category (new)
        public ObservableCollection<FilterCategoryViewModel> CategoryViewModels { get; } = new ObservableCollection<FilterCategoryViewModel>();

        public bool HasTags => CategoryViewModels.Count > 0 || AvailableTags.Count > 0;
        public bool HasNoTags => !HasTags;

        public bool TagMatchAnd
        {
            get => _filterState.TagMatchMode == TagMatchMode.And;
            set
            {
                if (value)
                {
                    _filterState.TagMatchMode = TagMatchMode.And;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(TagMatchOr));
                    MarkPresetModified();
                }
            }
        }

        public bool TagMatchOr
        {
            get => _filterState.TagMatchMode == TagMatchMode.Or;
            set
            {
                if (value)
                {
                    _filterState.TagMatchMode = TagMatchMode.Or;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(TagMatchAnd));
                    MarkPresetModified();
                }
            }
        }

        /// <summary>
        /// Marks the current preset as modified and updates the header text.
        /// </summary>
        private void MarkPresetModified()
        {
            if (!string.IsNullOrEmpty(_activePresetName) && !_presetModified)
            {
                _presetModified = true;
                OnPropertyChanged(nameof(HeaderText));
                OnPropertyChanged(nameof(CanUpdatePreset));
                Log($"FilterDialog: Preset '{_activePresetName}' marked as modified");
            }
            
            // Check if current filters match any preset (including the active one)
            // This will auto-select matching presets and remove asterisk if filters match
            CheckAndSelectMatchingPreset();
        }

        /// <summary>
        /// Checks if the current filter state matches any preset and auto-selects it if found.
        /// This removes the asterisk when filters match a preset and auto-selects matching presets.
        /// </summary>
        private void CheckAndSelectMatchingPreset()
        {
            if (_filterState == null) return;
            
            var currentJson = JsonSerializer.Serialize(_filterState);
            
            // Check if current state matches any preset
            foreach (var preset in _presets)
            {
                var presetJson = JsonSerializer.Serialize(preset.FilterState);
                
                if (currentJson == presetJson)
                {
                    // Found a match
                    if (preset.Name == _activePresetName)
                    {
                        // Matches the currently active preset - just clear modified flag
                        if (_presetModified)
                        {
                            Log($"FilterDialog: Current filters match active preset '{_activePresetName}', clearing modified flag");
                            _presetModified = false;
                            _originalPresetState = JsonSerializer.Deserialize<FilterState>(presetJson) ?? new FilterState();
                            OnPropertyChanged(nameof(HeaderText));
                            OnPropertyChanged(nameof(CanUpdatePreset));
                        }
                    }
                    else
                    {
                        // Matches a different preset - switch to it
                        Log($"FilterDialog: Current filters match preset '{preset.Name}', auto-selecting it");
                        
                        // Suppress SelectionChanged to prevent reloading filters
                        _isInitializing = true;
                        try
                        {
                            SelectedPresetName = preset.Name;
                            _activePresetName = preset.Name;
                            _presetModified = false;
                            _originalPresetState = JsonSerializer.Deserialize<FilterState>(presetJson) ?? new FilterState();
                        }
                        finally
                        {
                            _isInitializing = false;
                        }
                        
                        OnPropertyChanged(nameof(HeaderText));
                        OnPropertyChanged(nameof(CanUpdatePreset));
                    }
                    return; // Found a match, no need to check further
                }
            }
            
            // No match found - if we have an active preset, keep it modified
            // (This maintains the existing behavior when filters don't match any preset)
        }

        /// <summary>
        /// Loads presets into the UI collections, always including "None" as the first option.
        /// </summary>
        private void LoadPresets()
        {
            PresetNames.Clear();
            Presets.Clear();
            
            // Always add "None" as the first option
            PresetNames.Add(NonePresetName);
            
            foreach (var preset in _presets)
            {
                PresetNames.Add(preset.Name);
                Presets.Add(preset);
            }
            
            // Select active preset if it exists, otherwise select "None"
            if (!string.IsNullOrEmpty(_activePresetName) && PresetNames.Contains(_activePresetName))
            {
                SelectedPresetName = _activePresetName;
            }
            else
            {
                SelectedPresetName = NonePresetName;
            }
            
            Log($"FilterDialog: Loaded {_presets.Count} presets into UI, selected: {SelectedPresetName}");
        }

        private void UpdateTagSelectionState()
        {
            AvailableTags.Clear();
            CategoryViewModels.Clear();

            if (_libraryIndex != null)
            {
                var categories = _libraryIndex.Categories ?? new List<TagCategory>();
                var tags = _libraryIndex.Tags ?? new List<Tag>();

                // Get all tags that are selected or excluded in filter state
                var allFilterTags = _filterState.SelectedTags
                    .Concat(_filterState.ExcludedTags)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                // If using new format (categories exist)
                if (categories.Count > 0)
                {
                    // Track which tags have been processed
                    var processedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    foreach (var category in categories.OrderBy(c => c.SortOrder))
                    {
                        var categoryVm = new FilterCategoryViewModel
                        {
                            CategoryId = category.Id,
                            CategoryName = category.Name
                        };

                        // Get tags for this category
                        var categoryTags = tags.Where(t => t.CategoryId == category.Id).OrderBy(t => t.Name);

                        foreach (var tag in categoryTags)
                        {
                            var tagVm = new FilterTagViewModel
                            {
                                Tag = tag.Name,
                                CategoryId = category.Id,
                                IsPlusSelected = _filterState.SelectedTags.Any(t => string.Equals(t, tag.Name, StringComparison.OrdinalIgnoreCase)),
                                IsMinusSelected = _filterState.ExcludedTags.Any(t => string.Equals(t, tag.Name, StringComparison.OrdinalIgnoreCase))
                            };
                            categoryVm.Tags.Add(tagVm);
                            processedTags.Add(tag.Name);
                        }

                        // Load local match mode from filter state if it exists
                        if (_filterState.CategoryLocalMatchModes != null && 
                            _filterState.CategoryLocalMatchModes.TryGetValue(category.Id, out var localMode))
                        {
                            categoryVm.LocalMatchModeIndex = localMode == TagMatchMode.And ? 0 : 1;
                        }

                        if (categoryVm.Tags.Count > 0)
                        {
                            CategoryViewModels.Add(categoryVm);
                        }
                    }

                    // Handle orphaned tags (tags in filter state but not defined in categories)
                    var orphanedTags = allFilterTags.Where(t => !processedTags.Contains(t)).ToList();
                    if (orphanedTags.Count > 0)
                    {
                        Log($"FilterDialog.UpdateTagSelectionState: Found {orphanedTags.Count} orphaned tags in filter state");

                        var orphanedCategoryVm = new FilterCategoryViewModel
                        {
                            CategoryId = string.Empty,
                            CategoryName = "Uncategorized"
                        };

                        foreach (var tagName in orphanedTags.OrderBy(t => t))
                        {
                            var tagVm = new FilterTagViewModel
                            {
                                Tag = tagName,
                                CategoryId = string.Empty,
                                IsPlusSelected = _filterState.SelectedTags.Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase)),
                                IsMinusSelected = _filterState.ExcludedTags.Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase))
                            };
                            orphanedCategoryVm.Tags.Add(tagVm);
                        }

                        // Load local match mode from filter state if it exists (same as regular categories)
                        if (_filterState.CategoryLocalMatchModes != null && 
                            _filterState.CategoryLocalMatchModes.TryGetValue(string.Empty, out var orphanedMode))
                        {
                            orphanedCategoryVm.LocalMatchModeIndex = orphanedMode == TagMatchMode.And ? 0 : 1;
                        }

                        CategoryViewModels.Add(orphanedCategoryVm);
                    }
                }
                else if (_libraryIndex.AvailableTags != null && _libraryIndex.AvailableTags.Count > 0)
                {
                    // Legacy format: flat tags (for backward compatibility)
                    foreach (var tag in _libraryIndex.AvailableTags.OrderBy(t => t))
                    {
                        var tagVm = new FilterTagViewModel
                        {
                            Tag = tag,
                            IsPlusSelected = _filterState.SelectedTags.Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase)),
                            IsMinusSelected = _filterState.ExcludedTags.Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase))
                        };
                        AvailableTags.Add(tagVm);
                    }
                }
            }

            // Set global match mode dropdown (default to AND = index 0)
            if (GlobalMatchModeComboBox != null)
            {
                GlobalMatchModeComboBox.SelectedIndex = _filterState.GlobalMatchMode == false ? 1 : 0;
            }

            OnPropertyChanged(nameof(HasTags));
            OnPropertyChanged(nameof(HasNoTags));
        }

        private void RemoveTagCaseInsensitive(List<string> list, string tagToRemove)
        {
            var itemToRemove = list.FirstOrDefault(t => string.Equals(t, tagToRemove, StringComparison.OrdinalIgnoreCase));
            if (itemToRemove != null)
            {
                list.Remove(itemToRemove);
            }
        }

        private bool ContainsTagCaseInsensitive(List<string> list, string tag)
        {
            return list.Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase));
        }

        private void PlusButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggleButton && toggleButton.DataContext is FilterTagViewModel viewModel)
            {
                viewModel.IsPlusSelected = toggleButton.IsChecked == true;
                if (viewModel.IsPlusSelected)
                {
                    // Add to SelectedTags, remove from ExcludedTags (case-insensitive)
                    if (!ContainsTagCaseInsensitive(_filterState.SelectedTags, viewModel.Tag))
                    {
                        _filterState.SelectedTags.Add(viewModel.Tag);
                    }
                    RemoveTagCaseInsensitive(_filterState.ExcludedTags, viewModel.Tag);
                    viewModel.IsMinusSelected = false;
                }
                else
                {
                    // Remove from SelectedTags (case-insensitive)
                    RemoveTagCaseInsensitive(_filterState.SelectedTags, viewModel.Tag);
                }
                MarkPresetModified();
            }
        }

        private void MinusButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggleButton && toggleButton.DataContext is FilterTagViewModel viewModel)
            {
                viewModel.IsMinusSelected = toggleButton.IsChecked == true;
                if (viewModel.IsMinusSelected)
                {
                    // Add to ExcludedTags, remove from SelectedTags (case-insensitive)
                    if (!ContainsTagCaseInsensitive(_filterState.ExcludedTags, viewModel.Tag))
                    {
                        _filterState.ExcludedTags.Add(viewModel.Tag);
                    }
                    RemoveTagCaseInsensitive(_filterState.SelectedTags, viewModel.Tag);
                    viewModel.IsPlusSelected = false;
                }
                else
                {
                    // Remove from ExcludedTags (case-insensitive)
                    RemoveTagCaseInsensitive(_filterState.ExcludedTags, viewModel.Tag);
                }
                MarkPresetModified();
            }
        }

        private void ToggleCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is FilterCategoryViewModel categoryVm)
            {
                categoryVm.IsExpanded = !categoryVm.IsExpanded;
                Log($"FilterDialog.ToggleCategoryButton_Click: Category '{categoryVm.CategoryName}' IsExpanded={categoryVm.IsExpanded}");
            }
        }

        private void LocalMatchModeChanged(object? sender, SelectionChangedEventArgs e)
        {
            // Suppress event during initialization to prevent spurious preset modifications
            if (_isInitializing) return;
            
            if (sender is ComboBox comboBox && comboBox.Tag is FilterCategoryViewModel categoryVm)
            {
                // Initialize dictionaries if needed
                if (_filterState.CategoryLocalMatchModes == null)
                {
                    _filterState.CategoryLocalMatchModes = new Dictionary<string, TagMatchMode>();
                }

                // 0 = AND, 1 = OR - read directly from ComboBox to get current selection
                var matchMode = comboBox.SelectedIndex == 0 ? TagMatchMode.And : TagMatchMode.Or;
                _filterState.CategoryLocalMatchModes[categoryVm.CategoryId] = matchMode;
                
                Log($"FilterDialog.LocalMatchModeChanged: Category '{categoryVm.CategoryName}' local match mode = {matchMode}");
                MarkPresetModified();
            }
        }

        private void GlobalMatchMode_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            // Suppress event during initialization to prevent spurious preset modifications
            if (_isInitializing) return;
            
            if (GlobalMatchModeComboBox?.SelectedItem is ComboBoxItem item &&
                item.Tag is string tagStr &&
                bool.TryParse(tagStr, out var isAnd))
            {
                _filterState.GlobalMatchMode = isAnd;
                Log($"FilterDialog.GlobalMatchMode_SelectionChanged: Set to {(isAnd ? "AND" : "OR")}");
                MarkPresetModified();
            }
        }

        /// <summary>
        /// Handles preset selection from dropdown. If "None" is selected, clears active preset but preserves filters.
        /// </summary>
        private void PresetComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            // Suppress event during initialization to prevent overwriting passed-in filter state
            if (_isInitializing) return;
            
            if (SelectedPresetName == null) return;
            
            // Handle "None" selection - clear active preset but don't reset filters
            if (SelectedPresetName == NonePresetName)
            {
                Log("FilterDialog: Clearing active preset (switching to None)");
                _activePresetName = null;
                _presetModified = false;
                _originalPresetState = null;
                OnPropertyChanged(nameof(HeaderText));
                OnPropertyChanged(nameof(CanUpdatePreset));
                return;
            }
            
            var preset = _presets.FirstOrDefault(p => p.Name == SelectedPresetName);
            if (preset == null)
            {
                Log($"FilterDialog: Preset '{SelectedPresetName}' not found in presets list");
                return;
            }
            
            Log($"FilterDialog: Loading preset '{SelectedPresetName}'");
            
            // Deep copy the preset's FilterState into our working copy
            var json = JsonSerializer.Serialize(preset.FilterState);
            _filterState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            
            // Store original state for comparison
            _originalPresetState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            _presetModified = false;
            
            // Update all UI bindings
            OnPropertyChanged(nameof(FavoritesOnly));
            OnPropertyChanged(nameof(ExcludeBlacklisted));
            OnPropertyChanged(nameof(OnlyNeverPlayed));
            OnPropertyChanged(nameof(OnlyKnownDuration));
            OnPropertyChanged(nameof(OnlyKnownLoudness));
            OnPropertyChanged(nameof(MediaTypeAll));
            OnPropertyChanged(nameof(MediaTypeVideosOnly));
            OnPropertyChanged(nameof(MediaTypePhotosOnly));
            OnPropertyChanged(nameof(AudioFilterAll));
            OnPropertyChanged(nameof(AudioFilterWithAudio));
            OnPropertyChanged(nameof(AudioFilterWithoutAudio));
            OnPropertyChanged(nameof(MinDurationText));
            OnPropertyChanged(nameof(MaxDurationText));
            OnPropertyChanged(nameof(NoMinDuration));
            OnPropertyChanged(nameof(NoMaxDuration));
            OnPropertyChanged(nameof(TagMatchAnd));
            OnPropertyChanged(nameof(TagMatchOr));
            
            // Update active preset name BEFORE calling UpdateTagSelectionState
            // to prevent spurious preset modifications
            _activePresetName = SelectedPresetName;
            
            // Temporarily set _isInitializing to prevent event handlers from marking preset as modified
            try
            {
                _isInitializing = true;
                UpdateTagSelectionState();
            }
            finally
            {
                _isInitializing = false;
            }
            
            OnPropertyChanged(nameof(HeaderText));
            OnPropertyChanged(nameof(CanUpdatePreset));
            
            Log($"FilterDialog: Preset '{SelectedPresetName}' loaded successfully");
        }

        /// <summary>
        /// Adds a new preset from the current filter settings.
        /// </summary>
        private void AddPresetButton_Click(object? sender, RoutedEventArgs e)
        {
            AddPreset();
        }

        private void NewPresetNameTextBox_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Avalonia.Input.Key.Enter)
            {
                AddPreset();
                e.Handled = true;
            }
        }

        private void AddPreset()
        {
            var presetName = NewPresetNameTextBox?.Text?.Trim();
            if (string.IsNullOrWhiteSpace(presetName))
            {
                Log("FilterDialog: Cannot add preset - name is empty");
                return;
            }
            
            // Check if preset name already exists (case-insensitive)
            if (_presets.Any(p => string.Equals(p.Name, presetName, StringComparison.OrdinalIgnoreCase)))
            {
                Log($"FilterDialog: Preset '{presetName}' already exists (case-insensitive)");
                // TODO: Show error message to user
                return;
            }
            
            Log($"FilterDialog: Adding new preset '{presetName}'");
            
            // Create deep copy of current filter state
            var json = JsonSerializer.Serialize(_filterState);
            var filterStateCopy = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            
            var newPreset = new FilterPreset
            {
                Name = presetName,
                FilterState = filterStateCopy
            };
            
            _presets.Add(newPreset);
            LoadPresets();
            
            // Select the newly created preset
            SelectedPresetName = presetName;
            _activePresetName = presetName;
            _presetModified = false;
            
            // Explicitly set _originalPresetState to the new preset's FilterState
            // We can't rely on PresetComboBox_SelectionChanged firing when programmatically setting SelectedPresetName
            var presetStateJson = JsonSerializer.Serialize(newPreset.FilterState);
            _originalPresetState = JsonSerializer.Deserialize<FilterState>(presetStateJson) ?? new FilterState();
            
            OnPropertyChanged(nameof(HeaderText));
            OnPropertyChanged(nameof(CanUpdatePreset));
            
            // Clear text box
            NewPresetNameTextBox!.Text = "";
            
            Log($"FilterDialog: Preset '{presetName}' added successfully");
        }

        /// <summary>
        /// Renames a preset. Shows input dialog for new name.
        /// </summary>
        private async void RenamePresetButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is FilterPreset preset)
            {
                Log($"FilterDialog: Rename preset '{preset.Name}' requested");
                
                var dialog = new RenamePresetDialog(preset.Name);
                var newName = await dialog.ShowDialog<string?>(this);
                
                if (string.IsNullOrWhiteSpace(newName))
                {
                    Log($"FilterDialog: Rename cancelled or empty name provided");
                    return;
                }
                
                // Check if new name already exists (case-insensitive)
                if (_presets.Any(p => p != preset && string.Equals(p.Name, newName, StringComparison.OrdinalIgnoreCase)))
                {
                    Log($"FilterDialog: Preset '{newName}' already exists (case-insensitive)");
                    // TODO: Show error message to user
                    return;
                }
                
                var oldName = preset.Name;
                preset.Name = newName;
                
                // Update active preset name if this was the active preset
                if (_activePresetName == oldName)
                {
                    _activePresetName = newName;
                    OnPropertyChanged(nameof(HeaderText));
                }
                
                // Update selected preset name if this was selected
                if (SelectedPresetName == oldName)
                {
                    SelectedPresetName = newName;
                }
                
                LoadPresets();
                Log($"FilterDialog: Preset renamed from '{oldName}' to '{newName}'");
            }
        }

        /// <summary>
        /// Deletes a preset from the list.
        /// </summary>
        private void DeletePresetButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is FilterPreset preset)
            {
                Log($"FilterDialog: Deleting preset '{preset.Name}'");
                
                _presets.Remove(preset);
                LoadPresets();
                
                // Clear active preset if we deleted it
                if (_activePresetName == preset.Name)
                {
                    _activePresetName = null;
                    SelectedPresetName = NonePresetName;
                    OnPropertyChanged(nameof(HeaderText));
                    Log($"FilterDialog: Cleared active preset after deletion");
                }
                
                Log($"FilterDialog: Preset '{preset.Name}' deleted successfully");
            }
        }

        /// <summary>
        /// Moves a preset up in the list (changes dropdown order).
        /// </summary>
        private void MovePresetUpButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is FilterPreset preset)
            {
                var index = _presets.IndexOf(preset);
                if (index > 0)
                {
                    Log($"FilterDialog: Moving preset '{preset.Name}' up from position {index} to {index - 1}");
                    _presets.RemoveAt(index);
                    _presets.Insert(index - 1, preset);
                    LoadPresets();
                    SelectedPresetName = preset.Name;
                }
            }
        }

        /// <summary>
        /// Moves a preset down in the list (changes dropdown order).
        /// </summary>
        private void MovePresetDownButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is FilterPreset preset)
            {
                var index = _presets.IndexOf(preset);
                if (index < _presets.Count - 1)
                {
                    Log($"FilterDialog: Moving preset '{preset.Name}' down from position {index} to {index + 1}");
                    _presets.RemoveAt(index);
                    _presets.Insert(index + 1, preset);
                    LoadPresets();
                    SelectedPresetName = preset.Name;
                }
            }
        }

        /// <summary>
        /// Updates the selected preset with the current filter state and removes the modification marker.
        /// </summary>
        private void UpdatePresetButton_Click(object? sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_activePresetName) || _activePresetName == NonePresetName)
            {
                Log("FilterDialog: Cannot update preset - no preset selected");
                return;
            }
            
            var preset = _presets.FirstOrDefault(p => p.Name == _activePresetName);
            if (preset == null)
            {
                Log($"FilterDialog: Preset '{_activePresetName}' not found in presets list");
                return;
            }
            
            Log($"FilterDialog: Updating preset '{_activePresetName}' with current filter state");
            
            // Deep copy current filter state into preset
            var json = JsonSerializer.Serialize(_filterState);
            preset.FilterState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            
            // Store updated state as original
            _originalPresetState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            
            // Clear modification flag
            _presetModified = false;
            OnPropertyChanged(nameof(HeaderText));
            OnPropertyChanged(nameof(CanUpdatePreset));
            
            Log($"FilterDialog: Preset '{_activePresetName}' updated successfully");
        }

        private void ClearAllButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("FilterDialog: Clearing all filters");
            _filterState = new FilterState();
            FavoritesOnly = false;
            ExcludeBlacklisted = true;
            OnlyNeverPlayed = false;
            OnlyKnownDuration = false;
            OnlyKnownLoudness = false;
            AudioFilterAll = true;
            NoMinDuration = true;
            NoMaxDuration = true;
            MediaTypeAll = true;
            _filterState.SelectedTags.Clear();
            _filterState.ExcludedTags.Clear();
            TagMatchAnd = true;
            
            // Clear active preset when all filters are cleared
            _activePresetName = null;
            _presetModified = false;
            _originalPresetState = null;
            SelectedPresetName = NonePresetName;
            OnPropertyChanged(nameof(HeaderText));
            OnPropertyChanged(nameof(CanUpdatePreset));
            
            UpdateTagSelectionState();
            Log("FilterDialog: Cleared all filters and active preset");
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            _applyClicked = false;
            Close();
        }

        private void ApplyButton_Click(object? sender, RoutedEventArgs e)
        {
            // Copy all properties from working copy back to original
            _originalFilterState.FavoritesOnly = _filterState.FavoritesOnly;
            _originalFilterState.ExcludeBlacklisted = _filterState.ExcludeBlacklisted;
            _originalFilterState.OnlyNeverPlayed = _filterState.OnlyNeverPlayed;
            _originalFilterState.OnlyKnownDuration = _filterState.OnlyKnownDuration;
            _originalFilterState.OnlyKnownLoudness = _filterState.OnlyKnownLoudness;
            _originalFilterState.AudioFilter = _filterState.AudioFilter;
            _originalFilterState.MediaTypeFilter = _filterState.MediaTypeFilter;
            _originalFilterState.MinDuration = _filterState.MinDuration;
            _originalFilterState.MaxDuration = _filterState.MaxDuration;
            _originalFilterState.TagMatchMode = _filterState.TagMatchMode;
            _originalFilterState.GlobalMatchMode = _filterState.GlobalMatchMode;
            
            // Copy tag lists
            _originalFilterState.SelectedTags.Clear();
            _originalFilterState.SelectedTags.AddRange(_filterState.SelectedTags);
            _originalFilterState.ExcludedTags.Clear();
            _originalFilterState.ExcludedTags.AddRange(_filterState.ExcludedTags);
            
            // Copy category local match modes
            if (_filterState.CategoryLocalMatchModes != null)
            {
                _originalFilterState.CategoryLocalMatchModes = new Dictionary<string, TagMatchMode>(_filterState.CategoryLocalMatchModes);
            }
            else
            {
                _originalFilterState.CategoryLocalMatchModes = null;
            }
            
            // Check if filters match any preset - if they match the active preset, keep it; 
            // if they match a different preset, switch to it; otherwise clear if they differ
            if (!string.IsNullOrEmpty(_activePresetName) && _originalPresetState != null)
            {
                var currentJson = JsonSerializer.Serialize(_filterState);
                var originalJson = JsonSerializer.Serialize(_originalPresetState);
                
                if (currentJson != originalJson)
                {
                    // Filters differ from active preset - check if they match a different preset
                    var matchedPreset = _presets.FirstOrDefault(p => 
                    {
                        var presetJson = JsonSerializer.Serialize(p.FilterState);
                        return presetJson == currentJson;
                    });
                    
                    if (matchedPreset != null)
                    {
                        // Matches a different preset - switch to it
                        Log($"FilterDialog: Filters match preset '{matchedPreset.Name}', switching to it");
                        _activePresetName = matchedPreset.Name;
                    }
                    else
                    {
                        // Doesn't match any preset - clear active preset name
                        Log($"FilterDialog: Clearing active preset '{_activePresetName}' because filters differ and don't match any preset");
                        _activePresetName = null;
                    }
                }
                // If currentJson == originalJson, filters match active preset - keep it (no change needed)
            }
            else if (string.IsNullOrEmpty(_activePresetName))
            {
                // No active preset - check if filters match any preset and auto-select it
                var currentJson = JsonSerializer.Serialize(_filterState);
                var matchedPreset = _presets.FirstOrDefault(p => 
                {
                    var presetJson = JsonSerializer.Serialize(p.FilterState);
                    return presetJson == currentJson;
                });
                
                if (matchedPreset != null)
                {
                    Log($"FilterDialog: Filters match preset '{matchedPreset.Name}', auto-selecting it");
                    _activePresetName = matchedPreset.Name;
                }
            }
            
            _applyClicked = true;
            Close();
        }

        public bool WasApplied => _applyClicked;

        /// <summary>
        /// Returns the current list of presets (for saving to settings).
        /// </summary>
        public List<FilterPreset> GetPresets() => _presets;

        /// <summary>
        /// Returns the active preset name (null if "None" is selected).
        /// </summary>
        public string? GetActivePresetName() => _activePresetName;

        private void OnDialogOpened(object? sender, EventArgs e)
        {
            // Set position after window is fully opened and laid out (Avalonia best practice)
            if (_savedPosition.HasValue)
            {
                Position = _savedPosition.Value;
                Log($"FilterDialog: Position set to ({_savedPosition.Value.X}, {_savedPosition.Value.Y}) after window opened");
            }
        }

        private void OnDialogClosing(object? sender, WindowClosingEventArgs e)
        {
            // Save dialog bounds
            MainWindow.SaveDialogBounds("FilterDialog", Position.X, Position.Y, Width, Height);
            Log($"FilterDialog: Saved bounds on close - Position=({Position.X}, {Position.Y}), Size=({Width}, {Height})");
        }

        private string FormatTimeSpan(TimeSpan ts)
        {
            if (ts.TotalHours >= 1)
            {
                return $"{(int)ts.TotalHours:D2}:{ts.Minutes:D2}:{ts.Seconds:D2}";
            }
            return $"{ts.Minutes:D2}:{ts.Seconds:D2}";
        }

        private TimeSpan? ParseTimeSpan(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return null;

            // Try parsing HH:MM:SS or MM:SS format
            var parts = text.Split(':');
            if (parts.Length == 2)
            {
                // MM:SS
                if (int.TryParse(parts[0], out int minutes) && int.TryParse(parts[1], out int seconds))
                {
                    return new TimeSpan(0, minutes, seconds);
                }
            }
            else if (parts.Length == 3)
            {
                // HH:MM:SS
                if (int.TryParse(parts[0], out int hours) &&
                    int.TryParse(parts[1], out int minutes) &&
                    int.TryParse(parts[2], out int seconds))
                {
                    return new TimeSpan(hours, minutes, seconds);
                }
            }

            // Try parsing as total seconds
            if (double.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out double totalSeconds))
            {
                return TimeSpan.FromSeconds(totalSeconds);
            }

            return null;
        }

        public new event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    /// <summary>
    /// View model for a tag in the filter dialog (legacy, used by other parts of the codebase).
    /// </summary>
    public class TagViewModel : INotifyPropertyChanged
    {
        private bool _isSelected;
        private string _tag = string.Empty;

        public string Tag
        {
            get => _tag;
            set
            {
                _tag = value;
                OnPropertyChanged();
            }
        }

        public bool IsSelected
        {
            get => _isSelected;
            set
            {
                if (_isSelected != value)
                {
                    _isSelected = value;
                    OnPropertyChanged();
                }
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    /// <summary>
    /// View model for a category in the filter dialog tags tab.
    /// </summary>
    public class FilterCategoryViewModel : INotifyPropertyChanged
    {
        private bool _isExpanded = true;
        private int _localMatchModeIndex = 0; // Default to AND (index 0)

        public string CategoryId { get; set; } = string.Empty;
        public string CategoryName { get; set; } = string.Empty;
        public ObservableCollection<FilterTagViewModel> Tags { get; set; } = new ObservableCollection<FilterTagViewModel>();

        public bool IsExpanded
        {
            get => _isExpanded;
            set
            {
                _isExpanded = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(ExpandIcon));
            }
        }

        public string ExpandIcon => IsExpanded ? "▼" : "▶";

        // 0 = AND (ALL), 1 = OR (ANY)
        public int LocalMatchModeIndex
        {
            get => _localMatchModeIndex;
            set
            {
                _localMatchModeIndex = value;
                OnPropertyChanged();
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    /// <summary>
    /// View model for a tag in the enhanced filter dialog tags tab.
    /// </summary>
    public class FilterTagViewModel : INotifyPropertyChanged
    {
        private bool _isPlusSelected;
        private bool _isMinusSelected;
        private string _tag = string.Empty;

        public string Tag
        {
            get => _tag;
            set
            {
                _tag = value;
                OnPropertyChanged();
            }
        }

        public string CategoryId { get; set; } = string.Empty;

        public bool IsPlusSelected
        {
            get => _isPlusSelected;
            set
            {
                if (_isPlusSelected != value)
                {
                    _isPlusSelected = value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(BackgroundBrush));
                }
            }
        }

        public bool IsMinusSelected
        {
            get => _isMinusSelected;
            set
            {
                if (_isMinusSelected != value)
                {
                    _isMinusSelected = value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(BackgroundBrush));
                }
            }
        }

        public IBrush BackgroundBrush
        {
            get
            {
                if (IsPlusSelected)
                    return (IBrush)Application.Current!.Resources["LimeGreenBrush"]!;
                if (IsMinusSelected)
                    return (IBrush)Application.Current!.Resources["HugginsOrangeBrush"]!;
                return (IBrush)Application.Current!.Resources["VioletBrush"]!;
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    /// <summary>
    /// Simple dialog for renaming a filter preset.
    /// </summary>
    public partial class RenamePresetDialog : Window
    {
        private readonly TextBox _nameTextBox;

        public RenamePresetDialog(string currentName)
        {
            Title = "Rename Preset";
            Width = 400;
            Height = 150;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;

            _nameTextBox = new TextBox
            {
                Text = currentName,
                Watermark = "Enter preset name"
            };
            
            // Select all text for easy editing
            _nameTextBox.AttachedToVisualTree += (s, e) =>
            {
                _nameTextBox.Focus();
                _nameTextBox.SelectAll();
            };

            var okButton = new Button
            {
                Content = "OK",
                MinWidth = 80,
                IsDefault = true
            };
            okButton.Click += (s, e) => Close(_nameTextBox.Text);

            var cancelButton = new Button
            {
                Content = "Cancel",
                MinWidth = 80
            };
            cancelButton.Click += (s, e) => Close(null);
            
            // Handle Enter key in textbox
            _nameTextBox.KeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                {
                    Close(_nameTextBox.Text);
                    e.Handled = true;
                }
                else if (e.Key == Key.Escape)
                {
                    Close(null);
                    e.Handled = true;
                }
            };

            Content = new StackPanel
            {
                Margin = new Thickness(20),
                Spacing = 12,
                Children =
                {
                    new TextBlock { Text = "Preset Name:" },
                    _nameTextBox,
                    new StackPanel
                    {
                        Orientation = Avalonia.Layout.Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                        Spacing = 8,
                        Children = { okButton, cancelButton }
                    }
                }
            };
        }
    }
}
