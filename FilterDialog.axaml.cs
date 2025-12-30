using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Interactivity;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;

namespace ReelRoulette
{
    public partial class FilterDialog : Window, INotifyPropertyChanged
    {
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
            _filterState = filterState ?? new FilterState();
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
        public ObservableCollection<TagViewModel> AvailableTags { get; } = new ObservableCollection<TagViewModel>();

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
                    var tagVm = new TagViewModel
                    {
                        Tag = tag,
                        IsSelected = _filterState.SelectedTags.Contains(tag)
                    };
                    tagVm.PropertyChanged += (s, e) =>
                    {
                        if (e.PropertyName == nameof(TagViewModel.IsSelected))
                        {
                            var vm = (TagViewModel)s!;
                            if (vm.IsSelected)
                            {
                                if (!_filterState.SelectedTags.Contains(vm.Tag))
                                {
                                    _filterState.SelectedTags.Add(vm.Tag);
                                }
                            }
                            else
                            {
                                _filterState.SelectedTags.Remove(vm.Tag);
                            }
                        }
                    };
                    AvailableTags.Add(tagVm);
                }
            }

            OnPropertyChanged(nameof(HasTags));
            OnPropertyChanged(nameof(HasNoTags));
        }

        private void TagToggleButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggle && toggle.DataContext is TagViewModel tagVm)
            {
                tagVm.IsSelected = toggle.IsChecked == true;
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
    /// View model for a tag in the filter dialog.
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
}
