using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
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

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public FilterDialog(FilterState filterState, LibraryIndex? libraryIndex)
        {
            InitializeComponent();
            _originalFilterState = filterState ?? new FilterState();
            
            // Create a working copy to avoid modifying the original until Apply is clicked
            var json = JsonSerializer.Serialize(_originalFilterState);
            _filterState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            
            _libraryIndex = libraryIndex;
            DataContext = this;
            
            // Initialize tag selection state
            UpdateTagSelectionState();
        }

        public FilterState FilterState => _filterState;

        // Basic flags
        public bool FavoritesOnly
        {
            get => _filterState.FavoritesOnly;
            set
            {
                _filterState.FavoritesOnly = value;
                OnPropertyChanged();
            }
        }

        public bool ExcludeBlacklisted
        {
            get => _filterState.ExcludeBlacklisted;
            set
            {
                _filterState.ExcludeBlacklisted = value;
                OnPropertyChanged();
            }
        }

        public bool OnlyNeverPlayed
        {
            get => _filterState.OnlyNeverPlayed;
            set
            {
                _filterState.OnlyNeverPlayed = value;
                OnPropertyChanged();
            }
        }

        public bool OnlyKnownDuration
        {
            get => _filterState.OnlyKnownDuration;
            set
            {
                _filterState.OnlyKnownDuration = value;
                OnPropertyChanged();
            }
        }

        public bool OnlyKnownLoudness
        {
            get => _filterState.OnlyKnownLoudness;
            set
            {
                _filterState.OnlyKnownLoudness = value;
                OnPropertyChanged();
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
            }
        }

        // Tags
        public ObservableCollection<FilterTagViewModel> AvailableTags { get; } = new ObservableCollection<FilterTagViewModel>();

        public bool HasTags => AvailableTags.Count > 0;
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
                }
            }
        }

        private void UpdateTagSelectionState()
        {
            AvailableTags.Clear();
            if (_libraryIndex != null)
            {
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
            }
        }

        private void ClearAllButton_Click(object? sender, RoutedEventArgs e)
        {
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
            UpdateTagSelectionState();
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
            
            // Copy tag lists
            _originalFilterState.SelectedTags.Clear();
            _originalFilterState.SelectedTags.AddRange(_filterState.SelectedTags);
            _originalFilterState.ExcludedTags.Clear();
            _originalFilterState.ExcludedTags.AddRange(_filterState.ExcludedTags);
            
            _applyClicked = true;
            Close();
        }

        public bool WasApplied => _applyClicked;

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
}
