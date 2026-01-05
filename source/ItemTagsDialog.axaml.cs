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
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;

namespace ReelRoulette
{
    public enum TagState
    {
        AllItemsHaveTag,
        SomeItemsHaveTag,
        NoItemsHaveTag
    }

    public class BatchTagViewModel : INotifyPropertyChanged
    {
        private bool _isPlusSelected;
        private bool _isMinusSelected;
        private string _tag = string.Empty;
        private TagState _tagState = TagState.NoItemsHaveTag;

        public string Tag
        {
            get => _tag;
            set
            {
                _tag = value;
                OnPropertyChanged();
            }
        }

        public TagState TagState
        {
            get => _tagState;
            set
            {
                if (_tagState != value)
                {
                    _tagState = value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(BackgroundBrush));
                }
            }
        }

        public IBrush BackgroundBrush
        {
            get
            {
                return TagState switch
                {
                    TagState.AllItemsHaveTag => (IBrush)Application.Current!.Resources["LimeGreenBrush"]!,
                    TagState.SomeItemsHaveTag => (IBrush)Application.Current!.Resources["HugginsOrangeBrush"]!,
                    TagState.NoItemsHaveTag => (IBrush)Application.Current!.Resources["VioletBrush"]!,
                    _ => (IBrush)Application.Current!.Resources["VioletBrush"]!
                };
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
                }
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public partial class ItemTagsDialog : Window
    {
        private List<LibraryItem> _items;
        private LibraryIndex? _libraryIndex;
        private LibraryService? _libraryService;
        private ObservableCollection<BatchTagViewModel> _tagViewModels = new ObservableCollection<BatchTagViewModel>();

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public ItemTagsDialog(List<LibraryItem> items, LibraryIndex? libraryIndex, LibraryService? libraryService)
        {
            InitializeComponent();
            _items = items;
            _libraryIndex = libraryIndex;
            _libraryService = libraryService;

            Log($"ItemTagsDialog: Opening tags dialog for {items.Count} item(s)");

            // Get all unique tags from all items
            var allItemTags = items.SelectMany(item => item.Tags ?? new List<string>()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            
            // Get available tags from library index
            var availableTags = _libraryIndex?.AvailableTags ?? new List<string>();
            var allTags = availableTags.Concat(allItemTags).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(t => t).ToList();

            // Create view models for each tag
            foreach (var tag in allTags)
            {
                // Count how many items have this tag
                var itemsWithTag = items.Count(item => 
                    (item.Tags ?? new List<string>()).Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase)));
                
                var tagState = items.Count > 0 && itemsWithTag == items.Count 
                    ? TagState.AllItemsHaveTag 
                    : itemsWithTag > 0 
                        ? TagState.SomeItemsHaveTag 
                        : TagState.NoItemsHaveTag;

                _tagViewModels.Add(new BatchTagViewModel
                {
                    Tag = tag,
                    TagState = tagState,
                    IsPlusSelected = false,
                    IsMinusSelected = false
                });
            }

            TagsItemsControl!.ItemsSource = _tagViewModels;
        }

        private void PlusButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggleButton && toggleButton.DataContext is BatchTagViewModel viewModel)
            {
                viewModel.IsPlusSelected = toggleButton.IsChecked == true;
                // If plus is selected, unselect minus
                if (viewModel.IsPlusSelected)
                {
                    viewModel.IsMinusSelected = false;
                }
            }
        }

        private void MinusButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggleButton && toggleButton.DataContext is BatchTagViewModel viewModel)
            {
                viewModel.IsMinusSelected = toggleButton.IsChecked == true;
                // If minus is selected, unselect plus
                if (viewModel.IsMinusSelected)
                {
                    viewModel.IsPlusSelected = false;
                }
            }
        }

        private void AddTagButton_Click(object? sender, RoutedEventArgs e)
        {
            AddNewTag();
        }

        private void NewTagTextBox_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                AddNewTag();
                e.Handled = true;
            }
        }

        private void AddNewTag()
        {
            var tagName = NewTagTextBox?.Text?.Trim();
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return;
            }

            // Check if tag already exists in view models
            var existing = _tagViewModels.FirstOrDefault(vm => string.Equals(vm.Tag, tagName, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                // Tag exists, just select plus button
                existing.IsPlusSelected = true;
                existing.IsMinusSelected = false;
                NewTagTextBox!.Text = "";
                return;
            }

            // Add to available tags if not already there
            if (_libraryIndex != null)
            {
                if (!_libraryIndex.AvailableTags.Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase)))
                {
                    _libraryIndex.AvailableTags.Add(tagName);
                }
            }

            // Add to view models (insert in sorted position)
            var newViewModel = new BatchTagViewModel
            {
                Tag = tagName,
                TagState = TagState.NoItemsHaveTag,
                IsPlusSelected = true, // Automatically select plus for new tags
                IsMinusSelected = false
            };

            var sorted = _tagViewModels.Concat(new[] { newViewModel })
                .OrderBy(vm => vm.Tag)
                .ToList();
            
            _tagViewModels.Clear();
            foreach (var vm in sorted)
            {
                _tagViewModels.Add(vm);
            }

            // Clear text box
            NewTagTextBox!.Text = "";
        }

        private void OkButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Saving tags for {_items.Count} item(s)");
            
            // CRITICAL: Verify library service is available before attempting to save
            if (_libraryService == null)
            {
                Log($"ItemTagsDialog: ERROR - Library service is null, cannot save tags. Tags will be lost!");
                // Show error to user - don't close dialog, let them cancel
                var errorDialog = new Window
                {
                    Title = "Error: Cannot Save Tags",
                    Width = 450,
                    Height = 180,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner
                };
                
                var grid = new Grid();
                grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
                grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
                grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
                grid.Margin = new Thickness(16);
                
                var titleText = new TextBlock
                {
                    Text = "Error: Cannot save tags",
                    FontWeight = FontWeight.Bold,
                    FontSize = 14,
                    Margin = new Thickness(0, 0, 0, 12)
                };
                Grid.SetRow(titleText, 0);
                grid.Children.Add(titleText);
                
                var messageText = new TextBlock
                {
                    Text = "Library service is not available. Tag changes cannot be saved and will be lost when the application closes.\n\nPlease cancel and try again later.",
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(0, 0, 0, 12)
                };
                Grid.SetRow(messageText, 1);
                grid.Children.Add(messageText);
                
                var okButton = new Button
                {
                    Content = "OK",
                    HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                    Width = 80
                };
                okButton.Click += (s, args) => errorDialog.Close();
                Grid.SetRow(okButton, 2);
                grid.Children.Add(okButton);
                
                errorDialog.Content = grid;
                errorDialog.ShowDialog(this);
                // Don't close the dialog - let user cancel or try again
                return;
            }
            
            // Apply tag changes to all items
            foreach (var item in _items)
            {
                // Ensure Tags list exists
                if (item.Tags == null)
                {
                    item.Tags = new List<string>();
                }

                var oldTags = item.Tags.ToList();
                var currentTags = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);

                // Process each tag view model
                foreach (var vm in _tagViewModels)
                {
                    var tagName = vm.Tag;
                    var hasTag = currentTags.Contains(tagName);

                    if (vm.IsPlusSelected && !hasTag)
                    {
                        // Add tag
                        item.Tags.Add(tagName);
                        currentTags.Add(tagName);
                    }
                    else if (vm.IsMinusSelected && hasTag)
                    {
                        // Remove tag
                        item.Tags.RemoveAll(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
                        currentTags.Remove(tagName);
                    }
                }

                Log($"ItemTagsDialog: Tags updated for {item.FileName} - Old: [{string.Join(", ", oldTags)}], New: [{string.Join(", ", item.Tags)}]");

                // Update library item (service is guaranteed to be non-null here)
                _libraryService.UpdateItem(item);
            }

            // Save library once for all items (service is guaranteed to be non-null here)
            _libraryService.SaveLibrary();

            Log($"ItemTagsDialog: Tags saved successfully for {_items.Count} item(s)");
            Close(true);
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Cancelled tags dialog for {_items.Count} item(s)");
            Close(false);
        }
    }
}

