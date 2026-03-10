using Avalonia.Controls;
using Avalonia.Interactivity;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;

namespace ReelRoulette
{
    public class AutoTagMatchedFile : INotifyPropertyChanged
    {
        private bool _isSelected;

        public string FullPath { get; set; } = string.Empty;
        public string DisplayPath { get; set; } = string.Empty;
        public bool NeedsChange { get; set; }

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

    public class AutoTagSelectionResult
    {
        public string TagName { get; set; } = string.Empty;
        public List<string> SelectedItemPaths { get; set; } = new List<string>();
    }

    public class AutoTagMatchRow : INotifyPropertyChanged
    {
        private bool _isExpanded;
        private bool? _isSelectedState;
        private bool _isUpdatingSelectionState;
        private bool _viewAllMatches;
        public event Action? SelectionChanged;

        public string TagName { get; set; } = string.Empty;
        public int TotalMatchedCount { get; set; }
        public int WouldChangeCount { get; set; }
        public ObservableCollection<AutoTagMatchedFile> Files { get; set; } = new ObservableCollection<AutoTagMatchedFile>();
        public ObservableCollection<AutoTagMatchedFile> VisibleFiles { get; } = new ObservableCollection<AutoTagMatchedFile>();

        public bool IsExpanded
        {
            get => _isExpanded;
            set
            {
                if (_isExpanded != value)
                {
                    _isExpanded = value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(ExpandIcon));
                }
            }
        }

        public string ExpandIcon => IsExpanded ? "▼" : "▶";

        public bool? IsSelectedState
        {
            get => _isSelectedState;
            set
            {
                if (_isSelectedState != value)
                {
                    _isSelectedState = value;
                    OnPropertyChanged();

                    // User toggled the tag checkbox: select/deselect all currently visible files for this tag.
                    if (!_isUpdatingSelectionState && value.HasValue)
                    {
                        SetVisibleFileSelection(value.Value);
                    }
                }
            }
        }

        public void InitializeSubscriptions()
        {
            foreach (var file in Files)
            {
                file.PropertyChanged += File_PropertyChanged;
            }

            RefreshVisibleFiles(_viewAllMatches);
        }

        public void RefreshVisibleFiles(bool viewAllMatches)
        {
            _viewAllMatches = viewAllMatches;
            VisibleFiles.Clear();
            foreach (var file in Files.Where(f => viewAllMatches || f.NeedsChange))
            {
                VisibleFiles.Add(file);
            }

            if (VisibleFiles.Count == 0)
            {
                IsExpanded = false;
            }

            UpdateSelectionStateFromVisibleFiles();
        }

        public void SetVisibleFileSelection(bool selected)
        {
            foreach (var file in VisibleFiles)
            {
                file.IsSelected = selected;
            }
            UpdateSelectionStateFromVisibleFiles();
        }

        public List<string> GetSelectedPaths()
        {
            return VisibleFiles
                .Where(file => file.IsSelected)
                .Select(file => file.FullPath)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private void File_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(AutoTagMatchedFile.IsSelected))
            {
                UpdateSelectionStateFromVisibleFiles();
            }
        }

        private void UpdateSelectionStateFromVisibleFiles()
        {
            _isUpdatingSelectionState = true;
            try
            {
                if (VisibleFiles.Count == 0)
                {
                    _isSelectedState = false;
                }
                else
                {
                    var selectedCount = VisibleFiles.Count(file => file.IsSelected);
                    if (selectedCount == 0)
                    {
                        _isSelectedState = false;
                    }
                    else if (selectedCount == VisibleFiles.Count)
                    {
                        _isSelectedState = true;
                    }
                    else
                    {
                        _isSelectedState = null;
                    }
                }

                OnPropertyChanged(nameof(IsSelectedState));
            }
            finally
            {
                _isUpdatingSelectionState = false;
            }

            SelectionChanged?.Invoke();
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public partial class AutoTagDialog : Window, INotifyPropertyChanged
    {
        private readonly LibraryIndex? _libraryIndex;
        private readonly Func<bool, List<LibraryItem>> _getScopeItems;
        private readonly Func<bool, List<string>, Task<CoreAutoTagScanResponse?>>? _scanViaApiAsync;
        private bool _scanFullLibrary;
        private bool _viewAllMatches;
        private bool _scanHasRun;
        private bool _wasOk;
        private readonly List<AutoTagMatchRow> _allResults = new List<AutoTagMatchRow>();

        public ObservableCollection<AutoTagMatchRow> Results { get; } = new ObservableCollection<AutoTagMatchRow>();

        public bool ScanFullLibrary
        {
            get => _scanFullLibrary;
            set
            {
                if (_scanFullLibrary != value)
                {
                    _scanFullLibrary = value;
                    OnPropertyChanged();
                }
            }
        }

        public bool ViewAllMatches
        {
            get => _viewAllMatches;
            set
            {
                if (_viewAllMatches != value)
                {
                    _viewAllMatches = value;
                    OnPropertyChanged();
                    RefreshVisibleResults();
                }
            }
        }

        public bool ScanHasRun => _scanHasRun;
        public bool WasOk => _wasOk;

        private static void Log(string message)
        {
            ClientLogRelay.Log("desktop-auto-tag", message);
        }

        public AutoTagDialog(
            LibraryIndex? libraryIndex,
            bool scanFullLibraryDefault,
            Func<bool, List<LibraryItem>> getScopeItems,
            Func<bool, List<string>, Task<CoreAutoTagScanResponse?>>? scanViaApiAsync = null)
        {
            InitializeComponent();
            _libraryIndex = libraryIndex;
            _getScopeItems = getScopeItems;
            _scanViaApiAsync = scanViaApiAsync;
            _scanFullLibrary = scanFullLibraryDefault;
            DataContext = this;
            Log($"AutoTagDialog: Opened with ScanFullLibrary default={_scanFullLibrary}");
        }

        public List<AutoTagSelectionResult> GetAcceptedResults()
        {
            return Results
                .Select(row => new AutoTagSelectionResult
                {
                    TagName = row.TagName,
                    SelectedItemPaths = row.GetSelectedPaths()
                })
                .Where(result => result.SelectedItemPaths.Count > 0)
                .ToList();
        }

        private async void ScanFilesButton_Click(object? sender, RoutedEventArgs e)
        {
            Results.Clear();
            _allResults.Clear();
            _scanHasRun = true;

            if (_scanViaApiAsync != null)
            {
                var scopedPaths = _getScopeItems(ScanFullLibrary)
                    .Select(item => item.FullPath)
                    .Where(path => !string.IsNullOrWhiteSpace(path))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var response = await _scanViaApiAsync(ScanFullLibrary, scopedPaths);
                if (response == null)
                {
                    StatusTextBlock.Text = "Auto-tag scan failed. Core runtime is unavailable or still recovering.";
                    return;
                }

                foreach (var apiRow in response.Rows)
                {
                    var row = new AutoTagMatchRow
                    {
                        TagName = apiRow.TagName,
                        TotalMatchedCount = apiRow.TotalMatchedCount,
                        WouldChangeCount = apiRow.WouldChangeCount,
                        IsExpanded = false
                    };

                    foreach (var file in apiRow.Files)
                    {
                        row.Files.Add(new AutoTagMatchedFile
                        {
                            FullPath = file.FullPath,
                            DisplayPath = file.DisplayPath,
                            NeedsChange = file.NeedsChange,
                            IsSelected = false
                        });
                    }

                    if (row.Files.Count > 0)
                    {
                        row.InitializeSubscriptions();
                        row.SelectionChanged += HandleRowSelectionChanged;
                        _allResults.Add(row);
                    }
                }

                RefreshVisibleResults();
                if (Results.Count == 0)
                {
                    StatusTextBlock.Text = "Scan complete: no matching tags found.";
                    return;
                }

                UpdateStatusText();
                return;
            }

            if (_libraryIndex?.Tags == null || _libraryIndex.Tags.Count == 0)
            {
                StatusTextBlock.Text = "No tags exist yet. Create tags first, then scan.";
                Log("AutoTagDialog.ScanFiles: No tags available");
                return;
            }

            var candidateItems = _getScopeItems(ScanFullLibrary) ?? new List<LibraryItem>();
            if (candidateItems.Count == 0)
            {
                StatusTextBlock.Text = "No items available in this scan scope.";
                Log($"AutoTagDialog.ScanFiles: No candidate items (ScanFullLibrary={ScanFullLibrary})");
                return;
            }

            var tagNames = _libraryIndex.Tags
                .Where(tag => !string.IsNullOrWhiteSpace(tag.Name))
                .Select(tag => tag.Name.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(tag => tag, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (tagNames.Count == 0)
            {
                StatusTextBlock.Text = "No tags exist yet. Create tags first, then scan.";
                Log("AutoTagDialog.ScanFiles: No valid tag names available");
                return;
            }

            Log($"AutoTagDialog.ScanFiles: Starting scan. Tags={tagNames.Count}, Items={candidateItems.Count}, ScanFullLibrary={ScanFullLibrary}");

            foreach (var tagName in tagNames)
            {
                var matchedItems = candidateItems
                    .Where(item => ItemMatchesTag(item, tagName))
                    .ToList();

                if (matchedItems.Count == 0)
                {
                    continue;
                }

                var wouldChangeCount = matchedItems.Count(item => !ItemHasTag(item, tagName));
                var row = new AutoTagMatchRow
                {
                    TagName = tagName,
                    TotalMatchedCount = matchedItems.Count,
                    WouldChangeCount = wouldChangeCount,
                    IsExpanded = false
                };

                foreach (var item in matchedItems)
                {
                    var fullPath = item.FullPath;
                    if (string.IsNullOrWhiteSpace(fullPath))
                    {
                        continue;
                    }

                    row.Files.Add(new AutoTagMatchedFile
                    {
                        FullPath = fullPath,
                        DisplayPath = BuildDisplayPath(item),
                        NeedsChange = !ItemHasTag(item, tagName),
                        IsSelected = false
                    });
                }

                if (row.Files.Count > 0)
                {
                    row.InitializeSubscriptions();
                    row.SelectionChanged += HandleRowSelectionChanged;
                    _allResults.Add(row);
                }
            }

            RefreshVisibleResults();

            if (Results.Count == 0)
            {
                StatusTextBlock.Text = "Scan complete: no matching tags found.";
                Log("AutoTagDialog.ScanFiles: Scan complete with zero matches");
                return;
            }

            UpdateStatusText();
            var totalMatches = _allResults.Sum(row => row.TotalMatchedCount);
            var totalWouldChange = _allResults.Sum(row => row.WouldChangeCount);
            Log($"AutoTagDialog.ScanFiles: Scan complete. MatchingTags={_allResults.Count}, TotalMatches={totalMatches}, TotalWouldChange={totalWouldChange}");
        }

        private void RefreshVisibleResults()
        {
            foreach (var row in _allResults)
            {
                row.RefreshVisibleFiles(ViewAllMatches);
            }

            var visibleRows = _allResults
                .Where(row => ViewAllMatches || row.WouldChangeCount > 0)
                .OrderBy(row => row.TagName, StringComparer.OrdinalIgnoreCase)
                .ToList();

            Results.Clear();
            foreach (var row in visibleRows)
            {
                Results.Add(row);
            }

            UpdateStatusText();
        }

        private void HandleRowSelectionChanged()
        {
            UpdateStatusText();
        }

        private void UpdateStatusText()
        {
            if (!_scanHasRun)
            {
                StatusTextBlock.Text = "No scan has been run yet.";
                return;
            }

            if (_allResults.Count == 0)
            {
                StatusTextBlock.Text = "Scan complete: no matching tags found.";
                return;
            }

            var matchingTags = _allResults.Count;
            var totalMatches = _allResults.Sum(row => row.TotalMatchedCount);
            var totalWouldChange = _allResults.Sum(row => row.WouldChangeCount);
            var selectedChanges = _allResults
                .SelectMany(row => row.Files)
                .Count(file => file.NeedsChange && file.IsSelected);

            StatusTextBlock.Text = $"Scan complete: {matchingTags} matching tags, {totalMatches} matches, {selectedChanges}/{totalWouldChange} selected changes.";
        }

        private static string BuildDisplayPath(LibraryItem item)
        {
            var relativePath = item.RelativePath ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(relativePath))
            {
                return relativePath;
            }

            return item.FullPath ?? item.FileName ?? string.Empty;
        }

        private static bool ItemMatchesTag(LibraryItem item, string tagName)
        {
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return false;
            }

            var fileName = item.FileName;
            if (string.IsNullOrWhiteSpace(fileName))
            {
                fileName = Path.GetFileName(item.FullPath) ?? string.Empty;
            }

            var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
            if (!string.IsNullOrWhiteSpace(fileNameWithoutExtension) &&
                fileNameWithoutExtension.Contains(tagName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var relativePath = item.RelativePath ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(relativePath))
            {
                var normalizedRelative = relativePath.Replace('\\', '/');
                if (normalizedRelative.Contains(tagName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                var relativeSegments = normalizedRelative.Split('/', StringSplitOptions.RemoveEmptyEntries);
                if (relativeSegments.Any(segment => segment.Contains(tagName, StringComparison.OrdinalIgnoreCase)))
                {
                    return true;
                }
            }

            var fullPath = item.FullPath ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(fullPath))
            {
                var normalizedFullPath = fullPath.Replace('\\', '/');
                var fullSegments = normalizedFullPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
                if (fullSegments.Any(segment => segment.Contains(tagName, StringComparison.OrdinalIgnoreCase)))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool ItemHasTag(LibraryItem item, string tagName)
        {
            return item.Tags != null &&
                item.Tags.Any(existingTag => string.Equals(existingTag, tagName, StringComparison.OrdinalIgnoreCase));
        }

        private void OkButton_Click(object? sender, RoutedEventArgs e)
        {
            _wasOk = true;
            var selectedFileCount = Results.Sum(row => row.GetSelectedPaths().Count);
            Log($"AutoTagDialog: OK clicked. ScanHasRun={_scanHasRun}, SelectedFiles={selectedFileCount}");
            Close(true);
        }

        private void SelectAllButton_Click(object? sender, RoutedEventArgs e)
        {
            foreach (var row in Results)
            {
                row.SetVisibleFileSelection(true);
            }
        }

        private void DeselectAllButton_Click(object? sender, RoutedEventArgs e)
        {
            foreach (var row in Results)
            {
                row.SetVisibleFileSelection(false);
            }
        }

        private void ToggleExpandButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is AutoTagMatchRow row)
            {
                row.IsExpanded = !row.IsExpanded;
            }
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            _wasOk = false;
            Log("AutoTagDialog: Cancel clicked");
            Close(false);
        }

        public new event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
