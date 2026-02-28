using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Interactivity;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;

namespace ReelRoulette
{
    public partial class DuplicatesDialog : Window, INotifyPropertyChanged
    {
        private readonly LibraryService _libraryService;
        private readonly DuplicateScanResult _scanResult;
        private readonly DuplicateScanScope _scope;
        private readonly string? _sourceId;

        public ObservableCollection<DuplicateGroupViewModel> Groups { get; } = new ObservableCollection<DuplicateGroupViewModel>();
        public string HeaderText => $"Found {_scanResult.Groups.Count} duplicate group(s)";
        public string ExcludedText => $"Excluded (not ready): {_scanResult.ExcludedPending} pending, {_scanResult.ExcludedStale} stale, {_scanResult.ExcludedFailed} failed";

        public DuplicatesDialog()
        {
            InitializeComponent();
            DataContext = this;
            _libraryService = new LibraryService();
            _scanResult = new DuplicateScanResult();
            _scope = DuplicateScanScope.AllSources;
        }

        public DuplicatesDialog(LibraryService libraryService, DuplicateScanResult scanResult, DuplicateScanScope scope, string? sourceId)
        {
            _libraryService = libraryService;
            _scanResult = scanResult;
            _scope = scope;
            _sourceId = sourceId;
            InitializeComponent();
            DataContext = this;
            LoadGroups();
        }

        public new event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private void LoadGroups()
        {
            Groups.Clear();
            foreach (var group in _scanResult.Groups)
            {
                var vm = new DuplicateGroupViewModel(group);
                Groups.Add(vm);
            }
            OnPropertyChanged(nameof(HeaderText));
            OnPropertyChanged(nameof(ExcludedText));
        }

        private async void DeleteButton_Click(object? sender, RoutedEventArgs e)
        {
            if (Groups.Count == 0)
            {
                await ShowMessage("No duplicates", "No duplicate groups found for this scope.");
                return;
            }

            var confirm = await ShowDeleteConfirmDialog();
            if (!confirm)
            {
                return;
            }

            var selections = Groups.Select(group => new DuplicateDeletionSelection
            {
                KeepItemId = group.SelectedKeepOption.ItemId,
                ItemIds = group.KeepOptions.Select(option => option.ItemId).ToList()
            }).ToList();

            var result = _libraryService.DeleteDuplicateFiles(selections);
            _libraryService.SaveLibrary();

            var updatedScan = _libraryService.ScanDuplicates(_scope, _sourceId);
            _scanResult.Groups = updatedScan.Groups;
            _scanResult.ExcludedPending = updatedScan.ExcludedPending;
            _scanResult.ExcludedStale = updatedScan.ExcludedStale;
            _scanResult.ExcludedFailed = updatedScan.ExcludedFailed;
            LoadGroups();

            var summary = $"Deleted: {result.DeletedOnDisk}\n" +
                          $"Removed from library: {result.RemovedFromLibrary}\n" +
                          $"Failed: {result.Failed.Count} (kept in library)";
            if (result.Failed.Count > 0)
            {
                summary += "\n\nFailed paths:\n" + string.Join("\n", result.Failed.Select(f => $"{f.FullPath} ({f.Reason})"));
            }

            await ShowMessage("Duplicate Delete Results", summary);
        }

        private async Task<bool> ShowDeleteConfirmDialog()
        {
            var prompt = new Window
            {
                Title = "Confirm Permanent Delete",
                Width = 520,
                Height = 220,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var input = new TextBox
            {
                Watermark = "Type DELETE to confirm",
                Margin = new Avalonia.Thickness(16, 6, 16, 6)
            };

            bool accepted = false;
            var ok = new Button { Content = "Delete", MinWidth = 100 };
            var cancel = new Button { Content = "Cancel", MinWidth = 100 };
            ok.Click += (s, e) =>
            {
                if (string.Equals(input.Text?.Trim(), "DELETE", StringComparison.Ordinal))
                {
                    accepted = true;
                    prompt.Close();
                }
            };
            cancel.Click += (s, e) => prompt.Close();

            prompt.Content = new StackPanel
            {
                Children =
                {
                    new TextBlock
                    {
                        Text = "This permanently deletes non-kept duplicate files from disk.\nType DELETE to continue.",
                        Margin = new Avalonia.Thickness(16, 16, 16, 0),
                        TextWrapping = Avalonia.Media.TextWrapping.Wrap
                    },
                    input,
                    new StackPanel
                    {
                        Orientation = Avalonia.Layout.Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                        Spacing = 8,
                        Margin = new Avalonia.Thickness(16),
                        Children = { cancel, ok }
                    }
                }
            };

            await prompt.ShowDialog(this);
            return accepted;
        }

        private async Task ShowMessage(string title, string text)
        {
            var window = new Window
            {
                Title = title,
                Width = 620,
                Height = 340,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var close = new Button { Content = "OK", MinWidth = 80 };
            close.Click += (s, e) => window.Close();

            window.Content = new StackPanel
            {
                Children =
                {
                    new ScrollViewer
                    {
                        VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                        Height = 250,
                        Content = new TextBlock
                        {
                            Text = text,
                            TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                            Margin = new Avalonia.Thickness(16)
                        }
                    },
                    new StackPanel
                    {
                        Orientation = Avalonia.Layout.Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                        Margin = new Avalonia.Thickness(0, 0, 0, 16),
                        Children = { close }
                    }
                }
            };

            await window.ShowDialog(this);
        }

        private void CloseButton_Click(object? sender, RoutedEventArgs e)
        {
            Close();
        }
    }

    public class DuplicateGroupViewModel : INotifyPropertyChanged
    {
        private DuplicateItemOption _selectedKeepOption;
        public string Fingerprint { get; }
        public ObservableCollection<DuplicateItemOption> KeepOptions { get; } = new ObservableCollection<DuplicateItemOption>();
        public string Title => $"{KeepOptions.Count} files share fingerprint {Fingerprint.Substring(0, Math.Min(12, Fingerprint.Length))}...";

        public DuplicateItemOption SelectedKeepOption
        {
            get => _selectedKeepOption;
            set
            {
                _selectedKeepOption = value;
                OnPropertyChanged();
            }
        }

        public DuplicateGroupViewModel(DuplicateGroup group)
        {
            Fingerprint = group.Fingerprint;
            foreach (var item in group.Items)
            {
                KeepOptions.Add(new DuplicateItemOption(item));
            }

            _selectedKeepOption = KeepOptions
                .OrderByDescending(option => option.PlayCount)
                .ThenByDescending(option => option.LastWriteTimeUtc ?? DateTime.MinValue)
                .First();
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class DuplicateItemOption
    {
        public string ItemId { get; }
        public string FullPath { get; }
        public int PlayCount { get; }
        public DateTime? LastWriteTimeUtc { get; }
        public string DisplayText { get; }

        public DuplicateItemOption(DuplicateGroupItem item)
        {
            ItemId = item.ItemId;
            FullPath = item.FullPath;
            PlayCount = item.PlayCount;
            LastWriteTimeUtc = item.LastWriteTimeUtc;
            DisplayText = $"{item.FullPath} | Plays: {item.PlayCount} | Favorite: {(item.IsFavorite ? "Yes" : "No")} | Blacklisted: {(item.IsBlacklisted ? "Yes" : "No")}";
        }

        public override string ToString()
        {
            return DisplayText;
        }
    }
}
