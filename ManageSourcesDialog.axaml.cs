using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Interactivity;
using System;
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
        private readonly LibraryService _libraryService;
        private ObservableCollection<SourceViewModel> _sources = new();

        public ManageSourcesDialog() : this(new LibraryService())
        {
            // Design-time constructor
        }

        public ManageSourcesDialog(LibraryService libraryService)
        {
            _libraryService = libraryService;
            InitializeComponent();
            DataContext = this;
            LoadSources();
        }

        public new event PropertyChangedEventHandler? PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private void LoadSources()
        {
            _sources.Clear();
            
            if (_libraryService.LibraryIndex.Sources.Count == 0)
            {
                // Show empty state message by creating a dummy view model with the message
                var emptyViewModel = new SourceViewModel
                {
                    Id = "empty",
                    DisplayName = "No library sources found.",
                    RootPath = "Use Library → Import Folder to add a source.",
                    IsEnabled = false,
                    Statistics = new SourceStatistics()
                };
                _sources.Add(emptyViewModel);
                SourcesItemsControl.ItemsSource = _sources;
                return;
            }
            
            foreach (var source in _libraryService.LibraryIndex.Sources)
            {
                var stats = _libraryService.GetSourceStatistics(source.Id);
                var displayName = !string.IsNullOrEmpty(source.DisplayName) 
                    ? source.DisplayName 
                    : Path.GetFileName(source.RootPath);
                
                var viewModel = new SourceViewModel
                {
                    Id = source.Id,
                    DisplayName = displayName,
                    RootPath = source.RootPath,
                    IsEnabled = source.IsEnabled,
                    Statistics = stats
                };
                
                _sources.Add(viewModel);
            }
            
            SourcesItemsControl.ItemsSource = _sources;
        }

        private void EnableToggle_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggle && toggle.Tag is string sourceId)
            {
                var source = _libraryService.LibraryIndex.Sources.FirstOrDefault(s => s.Id == sourceId);
                if (source != null)
                {
                    source.IsEnabled = toggle.IsChecked ?? true;
                    _libraryService.UpdateSource(source);
                    _libraryService.SaveLibrary();
                    
                    // Update the view model to reflect the change
                    var viewModel = _sources.FirstOrDefault(s => s.Id == sourceId);
                    if (viewModel != null)
                    {
                        viewModel.IsEnabled = source.IsEnabled;
                    }
                }
            }
        }

        private async void RenameButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string sourceId)
            {
                var source = _libraryService.LibraryIndex.Sources.FirstOrDefault(s => s.Id == sourceId);
                if (source == null) return;

                var dialog = new RenameSourceDialog(source.DisplayName ?? Path.GetFileName(source.RootPath));
                var result = await dialog.ShowDialog<string?>(this);
                
                if (!string.IsNullOrWhiteSpace(result))
                {
                    source.DisplayName = result;
                    _libraryService.UpdateSource(source);
                    _libraryService.SaveLibrary();
                    LoadSources(); // Refresh display
                }
            }
        }

        private async void RefreshButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string sourceId)
            {
                var source = _libraryService.LibraryIndex.Sources.FirstOrDefault(s => s.Id == sourceId);
                if (source == null) return;

                try
                {
                    button.IsEnabled = false;
                    button.Content = "Refreshing...";
                    
                    var result = await Task.Run(() => _libraryService.RefreshSource(sourceId));
                    _libraryService.SaveLibrary();
                    
                    var message = $"Refresh complete:\n{result.Added} added, {result.Removed} removed, {result.Updated} updated";
                    var msgBox = new Window
                    {
                        Title = "Refresh Complete",
                        Width = 300,
                        Height = 150,
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
                    
                    LoadSources(); // Refresh display
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

        private async void RemoveButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string sourceId)
            {
                var source = _libraryService.LibraryIndex.Sources.FirstOrDefault(s => s.Id == sourceId);
                if (source == null) return;

                var displayName = !string.IsNullOrEmpty(source.DisplayName) 
                    ? source.DisplayName 
                    : Path.GetFileName(source.RootPath);
                var itemCount = _libraryService.GetItemsBySource(sourceId).Count();

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
                                Text = $"This will remove {itemCount} video(s) from your library.\n(The actual files will NOT be deleted from disk.)",
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
                    _libraryService.RemoveSource(sourceId);
                    _libraryService.SaveLibrary();
                    LoadSources(); // Refresh display
                }
            }
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

