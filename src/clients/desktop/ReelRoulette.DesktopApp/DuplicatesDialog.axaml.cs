using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Threading;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;

namespace ReelRoulette
{
    public enum DuplicateHandlingDefaultBehavior
    {
        KeepAll = 0,
        SelectBest = 1
    }

    public partial class DuplicatesDialog : Window, INotifyPropertyChanged
    {
        private readonly Func<List<CoreDuplicateApplySelection>, Task<CoreDuplicateApplyResponse?>> _applyDuplicatesAsync;
        private readonly Func<DuplicateScanScope, string?, Task<CoreDuplicateScanResponse?>> _scanDuplicatesAsync;
        private readonly CoreDuplicateScanResponse _scanResult;
        private readonly DuplicateScanScope _scope;
        private readonly string? _sourceId;
        private readonly string? _coreServerBaseUrl;
        private readonly DuplicateHandlingDefaultBehavior _duplicateHandlingDefaultBehavior;

        public ObservableCollection<DuplicateGroupViewModel> Groups { get; } = new ObservableCollection<DuplicateGroupViewModel>();
        public string HeaderText => $"Found {_scanResult.Groups.Count} duplicate group(s)";
        public string ExcludedText => $"Excluded (not ready): {_scanResult.ExcludedPending} pending, {_scanResult.ExcludedStale} stale, {_scanResult.ExcludedFailed} failed";

        public DuplicatesDialog()
        {
            InitializeComponent();
            DataContext = this;
            _applyDuplicatesAsync = _ => Task.FromResult<CoreDuplicateApplyResponse?>(null);
            _scanDuplicatesAsync = (_, _) => Task.FromResult<CoreDuplicateScanResponse?>(null);
            _scanResult = new CoreDuplicateScanResponse();
            _scope = DuplicateScanScope.AllSources;
            _coreServerBaseUrl = null;
            _duplicateHandlingDefaultBehavior = DuplicateHandlingDefaultBehavior.KeepAll;
        }

        public DuplicatesDialog(
            Func<List<CoreDuplicateApplySelection>, Task<CoreDuplicateApplyResponse?>> applyDuplicatesAsync,
            Func<DuplicateScanScope, string?, Task<CoreDuplicateScanResponse?>> scanDuplicatesAsync,
            CoreDuplicateScanResponse scanResult,
            DuplicateScanScope scope,
            string? sourceId,
            string? coreServerBaseUrl,
            DuplicateHandlingDefaultBehavior duplicateHandlingDefaultBehavior)
        {
            _applyDuplicatesAsync = applyDuplicatesAsync;
            _scanDuplicatesAsync = scanDuplicatesAsync;
            _scanResult = scanResult;
            _scope = scope;
            _sourceId = sourceId;
            _coreServerBaseUrl = coreServerBaseUrl;
            _duplicateHandlingDefaultBehavior = duplicateHandlingDefaultBehavior;
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
                var vm = new DuplicateGroupViewModel(group, _coreServerBaseUrl, _duplicateHandlingDefaultBehavior);
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

            var selections = Groups
                .Select(group => group.TryBuildApplySelection())
                .Where(selection => selection != null)
                .Cast<CoreDuplicateApplySelection>()
                .ToList();
            var skippedGroups = Groups.Count - selections.Count;
            var groupsHandled = selections.Count;
            var filesToDelete = selections.Sum(selection => Math.Max(0, selection.ItemIds.Count - 1));

            if (selections.Count == 0)
            {
                await ShowMessage(
                    "No Groups Selected",
                    "No duplicate groups are selected for deletion.\n\n" +
                    "Groups set to \"Keep All\" are skipped.");
                return;
            }

            var confirm = await ShowDeleteConfirmDialog(groupsHandled, filesToDelete);
            if (!confirm)
            {
                return;
            }

            var result = await _applyDuplicatesAsync(selections);
            if (result == null)
            {
                await ShowMessage("Duplicate Delete Results", "Duplicate delete failed (API required).");
                return;
            }

            var updatedScan = await _scanDuplicatesAsync(_scope, _sourceId);
            if (updatedScan != null)
            {
                _scanResult.Groups = updatedScan.Groups;
                _scanResult.ExcludedPending = updatedScan.ExcludedPending;
                _scanResult.ExcludedStale = updatedScan.ExcludedStale;
                _scanResult.ExcludedFailed = updatedScan.ExcludedFailed;
                LoadGroups();
            }

            var summary = $"Deleted: {result.DeletedOnDisk}\n" +
                          $"Removed from library: {result.RemovedFromLibrary}\n" +
                          $"Skipped groups (Keep All): {skippedGroups}\n" +
                          $"Failed: {result.Failures.Count} (kept in library)";
            if (result.Failures.Count > 0)
            {
                summary += "\n\nFailed paths:\n" + string.Join("\n", result.Failures.Select(f => $"{f.FullPath} ({f.Reason})"));
            }

            await ShowMessage("Duplicate Delete Results", summary);
        }

        private async Task<bool> ShowDeleteConfirmDialog(int groupsHandled, int filesToDelete)
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
                PlaceholderText = "Type DELETE to confirm",
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
                        Text = "This permanently deletes non-kept duplicate files from disk.\n\n" +
                               $"Groups to process: {groupsHandled}\n" +
                               $"Files to delete: {filesToDelete}\n\n" +
                               "Type DELETE to continue.",
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
        private DuplicateSelectionOption _selectedSelectionOption;
        public string Fingerprint { get; }
        public ObservableCollection<DuplicateItemOption> KeepOptions { get; } = new ObservableCollection<DuplicateItemOption>();
        public ObservableCollection<DuplicateSelectionOption> SelectionOptions { get; } = new ObservableCollection<DuplicateSelectionOption>();
        public string Title => $"{KeepOptions.Count} files share fingerprint {Fingerprint.Substring(0, Math.Min(12, Fingerprint.Length))}...";

        public DuplicateSelectionOption SelectedSelectionOption
        {
            get => _selectedSelectionOption;
            set
            {
                if (value == null)
                {
                    return;
                }

                _selectedSelectionOption = value;
                OnPropertyChanged();
            }
        }

        public DuplicateGroupViewModel(
            CoreDuplicateGroup group,
            string? coreServerBaseUrl,
            DuplicateHandlingDefaultBehavior defaultBehavior)
        {
            Fingerprint = group.Fingerprint;
            foreach (var item in group.Items)
            {
                KeepOptions.Add(new DuplicateItemOption(item, coreServerBaseUrl));
            }

            var keepAllOption = DuplicateSelectionOption.CreateKeepAll();
            SelectionOptions.Add(keepAllOption);
            foreach (var keepItem in KeepOptions)
            {
                SelectionOptions.Add(DuplicateSelectionOption.CreateKeepItem(keepItem));
            }

            var bestKeepOption = KeepOptions
                .OrderByDescending(option => option.PlayCount)
                .ThenByDescending(option => option.LastWriteTimeUtc ?? DateTime.MinValue)
                .FirstOrDefault();

            if (defaultBehavior == DuplicateHandlingDefaultBehavior.SelectBest && bestKeepOption != null)
            {
                _selectedSelectionOption = SelectionOptions.First(option =>
                    option.Mode == DuplicateSelectionMode.KeepItem &&
                    ReferenceEquals(option.KeepItem, bestKeepOption));
            }
            else
            {
                _selectedSelectionOption = keepAllOption;
            }
        }

        public CoreDuplicateApplySelection? TryBuildApplySelection()
        {
            return SelectedSelectionOption.Mode switch
            {
                DuplicateSelectionMode.KeepAll => null,
                DuplicateSelectionMode.KeepItem when SelectedSelectionOption.KeepItem != null => new CoreDuplicateApplySelection
                {
                    KeepItemId = SelectedSelectionOption.KeepItem.ItemId,
                    ItemIds = KeepOptions.Select(option => option.ItemId).ToList()
                },
                _ => null
            };
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public enum DuplicateSelectionMode
    {
        KeepAll = 0,
        KeepItem = 1
    }

    public sealed class DuplicateSelectionOption
    {
        public DuplicateSelectionMode Mode { get; }
        public DuplicateItemOption? KeepItem { get; }
        public string Label { get; }

        private DuplicateSelectionOption(DuplicateSelectionMode mode, DuplicateItemOption? keepItem, string label)
        {
            Mode = mode;
            KeepItem = keepItem;
            Label = label;
        }

        public static DuplicateSelectionOption CreateKeepAll()
            => new DuplicateSelectionOption(DuplicateSelectionMode.KeepAll, null, "Keep All (skip this group)");

        public static DuplicateSelectionOption CreateKeepItem(DuplicateItemOption keepItem)
            => new DuplicateSelectionOption(DuplicateSelectionMode.KeepItem, keepItem, $"Keep: {keepItem.SelectionLabel}");

        public override string ToString() => Label;
    }

    public class DuplicateItemOption : INotifyPropertyChanged
    {
        private static readonly HttpClient ThumbnailHttpClient = new();

        public string ItemId { get; }
        public string FullPath { get; }
        public int PlayCount { get; }
        public int TagCount { get; }
        public DateTime? LastWriteTimeUtc { get; }
        public string DisplayText { get; }
        public string SelectionLabel { get; }
        public string ThumbnailUri { get; }
        public string MetadataText { get; }
        private Bitmap? _thumbnailBitmap;
        public Bitmap? ThumbnailBitmap
        {
            get => _thumbnailBitmap;
            private set
            {
                if (ReferenceEquals(_thumbnailBitmap, value))
                {
                    return;
                }

                _thumbnailBitmap = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(HasThumbnailBitmap));
                OnPropertyChanged(nameof(ShowThumbnailPlaceholder));
            }
        }
        public bool HasThumbnailBitmap => ThumbnailBitmap != null;
        public bool ShowThumbnailPlaceholder => ThumbnailBitmap == null;

        public DuplicateItemOption(CoreDuplicateGroupItem item, string? coreServerBaseUrl)
        {
            ItemId = item.ItemId;
            FullPath = item.FullPath;
            PlayCount = item.PlayCount;
            TagCount = item.TagCount;
            LastWriteTimeUtc = item.LastWriteTimeUtc;
            ThumbnailUri = BuildThumbnailUri(coreServerBaseUrl, item.ItemId);
            var lastWriteText = item.LastWriteTimeUtc.HasValue
                ? item.LastWriteTimeUtc.Value.ToString("u")
                : "Unknown";
            MetadataText = $"Plays: {item.PlayCount} | Tags: {item.TagCount} | Favorite: {(item.IsFavorite ? "Yes" : "No")} | Blacklisted: {(item.IsBlacklisted ? "Yes" : "No")} | Last Write (UTC): {lastWriteText}";
            DisplayText = $"{item.FullPath} | Plays: {item.PlayCount} | Tags: {item.TagCount} | Favorite: {(item.IsFavorite ? "Yes" : "No")} | Blacklisted: {(item.IsBlacklisted ? "Yes" : "No")}";
            var fileName = Path.GetFileName(item.FullPath);
            SelectionLabel = $"{fileName} (plays: {item.PlayCount}, tags: {item.TagCount}, favorite: {(item.IsFavorite ? "Yes" : "No")}, blacklisted: {(item.IsBlacklisted ? "Yes" : "No")})";
            _ = LoadThumbnailAsync();
        }

        private async Task LoadThumbnailAsync()
        {
            if (string.IsNullOrWhiteSpace(ThumbnailUri))
            {
                return;
            }

            try
            {
                await using var stream = await ThumbnailHttpClient.GetStreamAsync(ThumbnailUri).ConfigureAwait(false);
                using var memoryStream = new MemoryStream();
                await stream.CopyToAsync(memoryStream).ConfigureAwait(false);
                memoryStream.Position = 0;
                var bitmap = new Bitmap(memoryStream);
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    ThumbnailBitmap = bitmap;
                });
            }
            catch
            {
                // Keep placeholder visible when thumbnail is unavailable.
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private static string BuildThumbnailUri(string? coreServerBaseUrl, string itemId)
        {
            if (string.IsNullOrWhiteSpace(coreServerBaseUrl) || string.IsNullOrWhiteSpace(itemId))
            {
                return string.Empty;
            }

            if (!Uri.TryCreate(coreServerBaseUrl, UriKind.Absolute, out var baseUri))
            {
                return string.Empty;
            }

            var builder = new UriBuilder(baseUri)
            {
                Path = $"/api/thumbnail/{Uri.EscapeDataString(itemId)}",
                Query = string.Empty
            };
            return builder.Uri.AbsoluteUri;
        }

        public override string ToString()
        {
            return DisplayText;
        }
    }
}
