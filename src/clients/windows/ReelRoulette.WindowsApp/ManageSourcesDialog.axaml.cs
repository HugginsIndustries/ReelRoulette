using Avalonia.Controls;
using Avalonia.Controls.Primitives;
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
    public partial class ManageSourcesDialog : Window, INotifyPropertyChanged
    {
        private readonly Func<Task<CoreLibraryStatsResponse?>>? _getLibraryStatsAsync;
        private readonly Func<Task<bool>>? _requestRefreshAsync;
        private readonly Func<string, bool, Task<bool>>? _setSourceEnabledAsync;
        private readonly Func<DuplicateScanScope, string?, Task<CoreDuplicateScanResponse?>>? _scanDuplicatesAsync;
        private readonly Func<List<CoreDuplicateApplySelection>, Task<CoreDuplicateApplyResponse?>>? _applyDuplicatesAsync;
        private ObservableCollection<SourceViewModel> _sources = new();

        public ManageSourcesDialog() : this(null, null, null, null, null)
        {
            // Design-time constructor
        }

        public ManageSourcesDialog(
            Func<Task<CoreLibraryStatsResponse?>>? getLibraryStatsAsync = null,
            Func<Task<bool>>? requestRefreshAsync = null,
            Func<string, bool, Task<bool>>? setSourceEnabledAsync = null,
            Func<DuplicateScanScope, string?, Task<CoreDuplicateScanResponse?>>? scanDuplicatesAsync = null,
            Func<List<CoreDuplicateApplySelection>, Task<CoreDuplicateApplyResponse?>>? applyDuplicatesAsync = null)
        {
            _getLibraryStatsAsync = getLibraryStatsAsync;
            _requestRefreshAsync = requestRefreshAsync;
            _setSourceEnabledAsync = setSourceEnabledAsync;
            _scanDuplicatesAsync = scanDuplicatesAsync;
            _applyDuplicatesAsync = applyDuplicatesAsync;
            InitializeComponent();
            DataContext = this;
            _ = LoadSourcesAsync();
        }

        public new event PropertyChangedEventHandler? PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private async Task LoadSourcesAsync()
        {
            _sources.Clear();

            CoreLibraryStatsResponse? statsSnapshot = null;
            if (_getLibraryStatsAsync != null)
            {
                statsSnapshot = await _getLibraryStatsAsync();
            }

            if (statsSnapshot == null || statsSnapshot.Sources.Count == 0)
            {
                // Show empty state message by creating a dummy view model with the message.
                var emptyViewModel = new SourceViewModel
                {
                    Id = "empty",
                    DisplayName = "No library sources found.",
                    RootPath = _getLibraryStatsAsync == null
                        ? "Manage Sources requires core API connection."
                        : "Use Library -> Import Folder to add a source.",
                    IsEnabled = false,
                    Statistics = new SourceStatistics()
                };
                _sources.Add(emptyViewModel);
                SourcesItemsControl.ItemsSource = _sources;
                return;
            }

            foreach (var source in statsSnapshot.Sources)
            {
                var displayName = !string.IsNullOrEmpty(source.DisplayName) 
                    ? source.DisplayName 
                    : Path.GetFileName(source.RootPath);

                var viewModel = new SourceViewModel
                {
                    Id = source.SourceId,
                    DisplayName = displayName,
                    RootPath = source.RootPath,
                    IsEnabled = source.IsEnabled,
                    Statistics = new SourceStatistics
                    {
                        TotalVideos = source.TotalVideos,
                        TotalPhotos = source.TotalPhotos,
                        TotalMedia = source.TotalMedia,
                        VideosWithAudio = source.VideosWithAudio,
                        VideosWithoutAudio = source.VideosWithoutAudio,
                        TotalDuration = TimeSpan.FromSeconds(Math.Max(0, source.TotalDurationSeconds)),
                        AverageDuration = source.AverageDurationSeconds.HasValue
                            ? TimeSpan.FromSeconds(Math.Max(0, source.AverageDurationSeconds.Value))
                            : null
                    }
                };

                _sources.Add(viewModel);
            }

            SourcesItemsControl.ItemsSource = _sources;
        }

        private async void EnableToggle_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggle && toggle.Tag is string sourceId)
            {
                var source = _sources.FirstOrDefault(s => string.Equals(s.Id, sourceId, StringComparison.OrdinalIgnoreCase));
                if (source != null)
                {
                    var previousEnabled = source.IsEnabled;
                    var nextEnabled = toggle.IsChecked ?? true;
                    if (_setSourceEnabledAsync != null)
                    {
                        var accepted = await _setSourceEnabledAsync(sourceId, nextEnabled);
                        if (!accepted)
                        {
                            toggle.IsChecked = previousEnabled;
                            return;
                        }
                    }
                    else
                    {
                        toggle.IsChecked = source.IsEnabled;
                        await ShowApiRequiredMessageAsync("Source enable/disable requires core API connection.");
                        return;
                    }

                    source.IsEnabled = nextEnabled;
                }
            }
        }

        private async void RenameButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string sourceId)
            {
                var source = _sources.FirstOrDefault(s => string.Equals(s.Id, sourceId, StringComparison.OrdinalIgnoreCase));
                if (source == null) return;

                var dialog = new RenameSourceDialog(source.DisplayName ?? Path.GetFileName(source.RootPath));
                var result = await dialog.ShowDialog<string?>(this);
                
                if (!string.IsNullOrWhiteSpace(result))
                {
                    await ShowApiRequiredMessageAsync("Source rename is API-required and not available as a desktop-local operation.");
                }
            }
        }

        private async void RefreshButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string sourceId)
            {
                var source = _sources.FirstOrDefault(s => string.Equals(s.Id, sourceId, StringComparison.OrdinalIgnoreCase));
                if (source == null) return;

                try
                {
                    button.IsEnabled = false;
                    button.Content = "Refreshing...";

                    if (_requestRefreshAsync == null)
                    {
                        throw new InvalidOperationException("Core refresh API is required.");
                    }

                    var accepted = await _requestRefreshAsync();
                    var message = accepted
                        ? "Refresh started in core runtime.\nProgress updates will continue while this dialog is closed."
                        : "Refresh is already running in core runtime.";
                    var msgBox = new Window
                    {
                        Title = "Refresh",
                        Width = 520,
                        Height = 190,
                        WindowStartupLocation = WindowStartupLocation.CenterOwner,
                        Content = new StackPanel
                        {
                            Margin = new Avalonia.Thickness(20),
                            Spacing = 12,
                            Children =
                            {
                                new TextBlock { Text = message, TextWrapping = Avalonia.Media.TextWrapping.Wrap },
                                new Button 
                                { 
                                    Content = "OK", 
                                    HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                                    MinWidth = 80
                                }
                            }
                        }
                    };
                    
                    ((Button)((StackPanel)msgBox.Content).Children[1]).Click += (s, e) => msgBox.Close();
                    await msgBox.ShowDialog(this);
                    
                    await LoadSourcesAsync(); // Refresh source stats display from core.
                }
                catch (Exception ex)
                {
                    var errorBox = new Window
                    {
                        Title = "Error",
                        Width = 300,
                        Height = 150,
                        WindowStartupLocation = WindowStartupLocation.CenterOwner,
                        Content = new StackPanel
                        {
                            Margin = new Avalonia.Thickness(20),
                            Spacing = 12,
                            Children =
                            {
                                new TextBlock { Text = $"Error refreshing source:\n{ex.Message}", TextWrapping = Avalonia.Media.TextWrapping.Wrap },
                                new Button 
                                { 
                                    Content = "OK", 
                                    HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                                    MinWidth = 80
                                }
                            }
                        }
                    };
                    
                    ((Button)((StackPanel)errorBox.Content).Children[1]).Click += (s, e) => errorBox.Close();
                    await errorBox.ShowDialog(this);
                }
                finally
                {
                    button.IsEnabled = true;
                    button.Content = "Refresh";
                }
            }
        }

        private async void FindDuplicatesButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.Tag is not string sourceId)
            {
                return;
            }

            var scope = await ShowDuplicateScopeDialog();
            if (!scope.HasValue)
            {
                return;
            }

            if (_scanDuplicatesAsync == null || _applyDuplicatesAsync == null)
            {
                await ShowApiRequiredMessageAsync("Duplicate scan requires core API connection.");
                return;
            }

            button.IsEnabled = false;
            var originalContent = button.Content;
            button.Content = "Scanning...";
            try
            {
                CoreDuplicateScanResponse? scanResponse;
                try
                {
                    scanResponse = await _scanDuplicatesAsync(scope.Value, sourceId);
                }
                catch (Exception ex)
                {
                    await ShowApiRequiredMessageAsync($"Duplicate scan failed: {ex.Message}");
                    return;
                }

                if (scanResponse == null)
                {
                    await ShowApiRequiredMessageAsync("Duplicate scan failed because the core API is unavailable or still recovering. Retry after reconnect.");
                    return;
                }

                var scan = new DuplicateScanResult
                {
                    Groups = scanResponse.Groups.Select(group => new DuplicateGroup
                    {
                        Fingerprint = group.Fingerprint,
                        Items = group.Items.Select(item => new DuplicateGroupItem
                        {
                            ItemId = item.ItemId,
                            FullPath = item.FullPath,
                            SourceId = item.SourceId,
                            IsFavorite = item.IsFavorite,
                            IsBlacklisted = item.IsBlacklisted,
                            PlayCount = item.PlayCount
                        }).ToList()
                    }).ToList(),
                    ExcludedPending = scanResponse.ExcludedPending,
                    ExcludedFailed = scanResponse.ExcludedFailed,
                    ExcludedStale = scanResponse.ExcludedStale
                };
                var dialog = new DuplicatesDialog(_applyDuplicatesAsync, _scanDuplicatesAsync, scan, scope.Value, sourceId);
                await dialog.ShowDialog(this);
                await LoadSourcesAsync();
            }
            finally
            {
                button.IsEnabled = true;
                button.Content = originalContent;
            }
        }

        private async Task<DuplicateScanScope?> ShowDuplicateScopeDialog()
        {
            var dialog = new Window
            {
                Title = "Duplicate Scan Scope",
                Width = 420,
                Height = 180,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var combo = new ComboBox
            {
                Margin = new Avalonia.Thickness(16, 8, 16, 8)
            };
            combo.Items.Add(new ComboBoxItem { Content = "Current source only", Tag = DuplicateScanScope.CurrentSource });
            combo.Items.Add(new ComboBoxItem { Content = "All enabled sources", Tag = DuplicateScanScope.AllEnabledSources });
            combo.Items.Add(new ComboBoxItem { Content = "All sources", Tag = DuplicateScanScope.AllSources });
            combo.SelectedIndex = 0;

            DuplicateScanScope? selected = null;
            var ok = new Button { Content = "Scan", MinWidth = 80 };
            var cancel = new Button { Content = "Cancel", MinWidth = 80 };
            ok.Click += (s, e) =>
            {
                if (combo.SelectedItem is ComboBoxItem item && item.Tag is DuplicateScanScope tag)
                {
                    selected = tag;
                }
                dialog.Close();
            };
            cancel.Click += (s, e) => dialog.Close();

            dialog.Content = new StackPanel
            {
                Children =
                {
                    new TextBlock
                    {
                        Text = "Choose duplicate scan scope:",
                        Margin = new Avalonia.Thickness(16, 16, 16, 0)
                    },
                    combo,
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

            await dialog.ShowDialog(this);
            return selected;
        }

        private async void RemoveButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string sourceId)
            {
                var source = _sources.FirstOrDefault(s => string.Equals(s.Id, sourceId, StringComparison.OrdinalIgnoreCase));
                if (source == null) return;

                var displayName = !string.IsNullOrEmpty(source.DisplayName) 
                    ? source.DisplayName 
                    : Path.GetFileName(source.RootPath);
                var itemCount = source.Statistics.TotalMedia;

                var confirmDialog = new Window
                {
                    Title = "Confirm Removal",
                    Width = 400,
                    Height = 200,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner,
                    Content = new StackPanel
                    {
                        Margin = new Avalonia.Thickness(20),
                        Spacing = 12,
                        Children =
                        {
                            new TextBlock 
                            { 
                                Text = $"Remove source \"{displayName}\"?", 
                                FontWeight = Avalonia.Media.FontWeight.Bold 
                            },
                            new TextBlock 
                            { 
                                Text = $"This will remove {itemCount} media item(s) from your library.\n(The actual files will NOT be deleted from disk.)",
                                TextWrapping = Avalonia.Media.TextWrapping.Wrap 
                            },
                            new StackPanel
                            {
                                Orientation = Avalonia.Layout.Orientation.Horizontal,
                                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                                Spacing = 8,
                                Children =
                                {
                                    new Button { Content = "Remove", MinWidth = 80, Name = "RemoveBtn" },
                                    new Button { Content = "Cancel", MinWidth = 80, Name = "CancelBtn" }
                                }
                            }
                        }
                    }
                };

                bool? result = null;
                var btnPanel = (StackPanel)((StackPanel)confirmDialog.Content).Children[2];
                ((Button)btnPanel.Children[0]).Click += (s, e) => { result = true; confirmDialog.Close(); };
                ((Button)btnPanel.Children[1]).Click += (s, e) => { result = false; confirmDialog.Close(); };
                
                await confirmDialog.ShowDialog(this);

                if (result == true)
                {
                    await ShowApiRequiredMessageAsync("Source removal is API-required and not available as a desktop-local operation.");
                }
            }
        }

        private async Task ShowApiRequiredMessageAsync(string message)
        {
            var msg = new Window
            {
                Title = "API Required",
                Width = 480,
                Height = 170,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                Content = new StackPanel
                {
                    Margin = new Avalonia.Thickness(16),
                    Spacing = 12,
                    Children =
                    {
                        new TextBlock
                        {
                            Text = message,
                            TextWrapping = Avalonia.Media.TextWrapping.Wrap
                        },
                        new Button
                        {
                            Content = "OK",
                            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                            MinWidth = 100
                        }
                    }
                }
            };

            if (msg.Content is StackPanel panel && panel.Children[1] is Button ok)
            {
                ok.Click += (_, _) => msg.Close();
            }

            await msg.ShowDialog(this);
        }

        private void CloseButton_Click(object? sender, RoutedEventArgs e)
        {
            Close();
        }
    }

    public class SourceViewModel : INotifyPropertyChanged
    {
        private string _id = string.Empty;
        private string _displayName = string.Empty;
        private string _rootPath = string.Empty;
        private bool _isEnabled = true;
        private SourceStatistics _statistics = new();

        public string Id
        {
            get => _id;
            set { _id = value; OnPropertyChanged(); }
        }

        public string DisplayName
        {
            get => _displayName;
            set { _displayName = value; OnPropertyChanged(); }
        }

        public string RootPath
        {
            get => _rootPath;
            set { _rootPath = value; OnPropertyChanged(); }
        }

        public bool IsEnabled
        {
            get => _isEnabled;
            set 
            { 
                _isEnabled = value; 
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsEnabledText));
            }
        }

        public string IsEnabledText => IsEnabled ? "Enabled" : "Disabled";

        public SourceStatistics Statistics
        {
            get => _statistics;
            set { _statistics = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public partial class RenameSourceDialog : Window
    {
        private readonly TextBox _nameTextBox;

        public RenameSourceDialog(string currentName)
        {
            Title = "Rename Source";
            Width = 400;
            Height = 150;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;

            _nameTextBox = new TextBox
            {
                Text = currentName,
                Watermark = "Enter source name"
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

            Content = new StackPanel
            {
                Margin = new Avalonia.Thickness(20),
                Spacing = 12,
                Children =
                {
                    new TextBlock { Text = "Source Name:" },
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

