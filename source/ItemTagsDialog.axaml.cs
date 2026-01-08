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

    public class ItemTagsCategoryViewModel : INotifyPropertyChanged
    {
        private bool _isExpanded = true;

        public string CategoryId { get; set; } = string.Empty;
        public string CategoryName { get; set; } = string.Empty;
        public ObservableCollection<BatchTagViewModel> Tags { get; set; } = new ObservableCollection<BatchTagViewModel>();

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

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
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

        public string CategoryId { get; set; } = string.Empty;

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
        private System.Collections.Generic.List<FilterPreset>? _filterPresets;
        private ObservableCollection<ItemTagsCategoryViewModel> _categoryViewModels = new ObservableCollection<ItemTagsCategoryViewModel>();
        private PixelPoint? _savedPosition; // Store position to set after window opens

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public ItemTagsDialog(List<LibraryItem> items, LibraryIndex? libraryIndex, LibraryService? libraryService, System.Collections.Generic.List<FilterPreset>? filterPresets = null)
        {
            InitializeComponent();
            _items = items;
            _libraryIndex = libraryIndex;
            _libraryService = libraryService;
            _filterPresets = filterPresets;

            Log($"ItemTagsDialog: Opening tags dialog for {items.Count} item(s)");

            // Load saved dialog bounds
            var (x, y, width, height) = MainWindow.LoadDialogBounds("ItemTagsDialog");
            
            if (x.HasValue && y.HasValue)
            {
                // Store position to set after window opens (Avalonia best practice)
                _savedPosition = new PixelPoint((int)x.Value, (int)y.Value);
                Log($"ItemTagsDialog: Will restore position to ({x.Value}, {y.Value}) after window opens");
            }
            else
            {
                // No saved position - center on owner window
                WindowStartupLocation = WindowStartupLocation.CenterOwner;
                Log("ItemTagsDialog: No saved position, centering on owner");
            }
            
            if (width.HasValue && width.Value > 0)
            {
                Width = width.Value;
                Log($"ItemTagsDialog: Restored width to {width.Value}");
            }
            
            if (height.HasValue && height.Value > 0)
            {
                Height = height.Value;
                Log($"ItemTagsDialog: Restored height to {height.Value}");
            }

            // Subscribe to window events
            Opened += OnOpened;
            Closing += OnClosing;

            LoadTagsByCategory();
            UpdateCategoryComboBox();
        }

        private void OnOpened(object? sender, EventArgs e)
        {
            // Set position after window is fully opened and laid out (Avalonia best practice)
            if (_savedPosition.HasValue)
            {
                Position = _savedPosition.Value;
                Log($"ItemTagsDialog: Position set to ({_savedPosition.Value.X}, {_savedPosition.Value.Y}) after window opened");
            }
        }

        private void OnClosing(object? sender, WindowClosingEventArgs e)
        {
            // Save dialog bounds
            MainWindow.SaveDialogBounds("ItemTagsDialog", Position.X, Position.Y, Width, Height);
            Log($"ItemTagsDialog: Saved bounds on close - Position=({Position.X}, {Position.Y}), Size=({Width}, {Height})");
        }

        private void LoadTagsByCategory()
        {
            _categoryViewModels.Clear();

            var categories = _libraryIndex?.Categories ?? new List<TagCategory>();
            var availableTags = _libraryIndex?.Tags ?? new List<Tag>();

            // Get all unique tags from all items
            var allItemTags = _items.SelectMany(item => item.Tags ?? new List<string>())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // Combine with available tags
            var allTagNames = availableTags.Select(t => t.Name)
                .Concat(allItemTags)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            Log($"ItemTagsDialog.LoadTagsByCategory: {categories.Count} categories, {availableTags.Count} available tags, {allTagNames.Count} total unique tags");

            // Track which tags have been processed
            var processedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Group tags by category
            foreach (var category in categories.OrderBy(c => c.SortOrder))
            {
                var categoryVm = new ItemTagsCategoryViewModel
                {
                    CategoryId = category.Id,
                    CategoryName = category.Name
                };

                // Process all tags that belong to this category OR that should belong to it (sorted alphabetically)
                foreach (var tagName in allTagNames.OrderBy(t => t, StringComparer.OrdinalIgnoreCase))
                {
                    // Find if this tag exists in available tags
                    var availableTag = availableTags.FirstOrDefault(t => 
                        string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase));

                    // Include tag if it belongs to this category
                    if (availableTag != null && availableTag.CategoryId == category.Id)
                    {
                        // Count how many items have this tag
                        var itemsWithTag = _items.Count(item =>
                            (item.Tags ?? new List<string>()).Any(t =>
                                string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase)));

                        var tagState = _items.Count > 0 && itemsWithTag == _items.Count
                            ? TagState.AllItemsHaveTag
                            : itemsWithTag > 0
                                ? TagState.SomeItemsHaveTag
                                : TagState.NoItemsHaveTag;

                        categoryVm.Tags.Add(new BatchTagViewModel
                        {
                            Tag = tagName,
                            CategoryId = category.Id,
                            TagState = tagState,
                            IsPlusSelected = false,
                            IsMinusSelected = false
                        });

                        processedTags.Add(tagName);
                    }
                }

                if (categoryVm.Tags.Count > 0)
                {
                    _categoryViewModels.Add(categoryVm);
                }
            }

            // Handle orphaned tags (tags on items but not defined in any category)
            var orphanedTags = allTagNames.Where(t => !processedTags.Contains(t)).ToList();
            if (orphanedTags.Count > 0)
            {
                Log($"ItemTagsDialog.LoadTagsByCategory: Found {orphanedTags.Count} orphaned tags");

                var orphanedCategoryVm = new ItemTagsCategoryViewModel
                {
                    CategoryId = string.Empty,
                    CategoryName = "Uncategorized"
                };

                foreach (var tagName in orphanedTags.OrderBy(t => t))
                {
                    var itemsWithTag = _items.Count(item =>
                        (item.Tags ?? new List<string>()).Any(t =>
                            string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase)));

                    var tagState = _items.Count > 0 && itemsWithTag == _items.Count
                        ? TagState.AllItemsHaveTag
                        : itemsWithTag > 0
                            ? TagState.SomeItemsHaveTag
                            : TagState.NoItemsHaveTag;

                    orphanedCategoryVm.Tags.Add(new BatchTagViewModel
                    {
                        Tag = tagName,
                        CategoryId = string.Empty,
                        TagState = tagState,
                        IsPlusSelected = false,
                        IsMinusSelected = false
                    });
                }

                _categoryViewModels.Add(orphanedCategoryVm);
            }

            CategoriesItemsControl.ItemsSource = _categoryViewModels;
        }

        private void UpdateCategoryComboBox()
        {
            TagCategoryComboBox.Items.Clear();
            var categories = _libraryIndex?.Categories ?? new List<TagCategory>();
            foreach (var category in categories.OrderBy(c => c.SortOrder))
            {
                TagCategoryComboBox.Items.Add(new ComboBoxItem
                {
                    Content = category.Name,
                    Tag = category.Id
                });
            }
            
            // Set default selection to first category if available
            if (TagCategoryComboBox.Items.Count > 0)
            {
                TagCategoryComboBox.SelectedIndex = 0;
            }
        }

        private void ToggleCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is ItemTagsCategoryViewModel categoryVm)
            {
                categoryVm.IsExpanded = !categoryVm.IsExpanded;
                Log($"ItemTagsDialog.ToggleCategoryButton_Click: Category '{categoryVm.CategoryName}' IsExpanded={categoryVm.IsExpanded}");
            }
        }

        private async void EditTagButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is BatchTagViewModel tagVm)
            {
                Log($"ItemTagsDialog.EditTagButton_Click: Editing tag '{tagVm.Tag}'");

                // Check if library service is available
                if (_libraryService == null)
                {
                    ShowLibraryServiceError();
                    return;
                }

                var dialog = new EditTagDialog();
                var categories = _libraryIndex?.Categories ?? new List<TagCategory>();
                dialog.Initialize(categories, tagVm.Tag, tagVm.CategoryId);

                await dialog.ShowDialog(this);

                if (dialog.WasOk && !string.IsNullOrEmpty(dialog.TagName) && !string.IsNullOrEmpty(dialog.CategoryId))
                {
                    // Check if category is new
                    if (!string.IsNullOrEmpty(dialog.CategoryName) &&
                        !categories.Any(c => c.Id == dialog.CategoryId))
                    {
                        var newCategory = new TagCategory
                        {
                            Id = dialog.CategoryId,
                            Name = dialog.CategoryName,
                            SortOrder = categories.Count
                        };
                        _libraryService.AddOrUpdateCategory(newCategory);
                        Log($"ItemTagsDialog.EditTagButton_Click: Created new category '{newCategory.Name}'");
                    }

                    // Rename tag
                    string oldTagName = tagVm.Tag;
                    string? newCategoryId = dialog.CategoryId != tagVm.CategoryId ? dialog.CategoryId : null;
                    _libraryService.RenameTag(oldTagName, dialog.TagName, newCategoryId);
                    Log($"ItemTagsDialog.EditTagButton_Click: Renamed tag to '{dialog.TagName}'");

                    // Update filter presets if tag name changed
                    if (!string.Equals(oldTagName, dialog.TagName, StringComparison.OrdinalIgnoreCase))
                    {
                        int presetsUpdated = LibraryService.UpdateFilterPresetsForRenamedTag(_filterPresets, oldTagName, dialog.TagName);
                        Log($"ItemTagsDialog.EditTagButton_Click: Updated {presetsUpdated} filter presets");
                    }

                    // Reload the UI
                    _libraryIndex = _libraryService.LibraryIndex;
                    LoadTagsByCategory();
                    UpdateCategoryComboBox();
                }
            }
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

            var selectedItem = TagCategoryComboBox.SelectedItem as ComboBoxItem;
            if (selectedItem == null)
            {
                Log("ItemTagsDialog.AddNewTag: No category selected");
                return;
            }

            var categoryId = selectedItem.Tag as string;
            if (string.IsNullOrEmpty(categoryId))
            {
                return;
            }

            // Check if tag already exists
            var availableTags = _libraryIndex?.Tags ?? new List<Tag>();
            var existingTag = availableTags.FirstOrDefault(t =>
                string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase));

            if (existingTag != null)
            {
                // Tag exists, find it in view models and select plus button
                foreach (var categoryVm in _categoryViewModels)
                {
                    var tagVm = categoryVm.Tags.FirstOrDefault(t =>
                        string.Equals(t.Tag, tagName, StringComparison.OrdinalIgnoreCase));
                    if (tagVm != null)
                    {
                        tagVm.IsPlusSelected = true;
                        tagVm.IsMinusSelected = false;
                        NewTagTextBox!.Text = "";
                        return;
                    }
                }
            }

            // Check if library service is available
            if (_libraryService == null)
            {
                ShowLibraryServiceError();
                return;
            }

            // Save current selection states before reloading
            var plusSelectedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var minusSelectedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var categoryVm in _categoryViewModels)
            {
                foreach (var tagVm in categoryVm.Tags)
                {
                    if (tagVm.IsPlusSelected)
                        plusSelectedTags.Add(tagVm.Tag);
                    if (tagVm.IsMinusSelected)
                        minusSelectedTags.Add(tagVm.Tag);
                }
            }

            // Add new tag
            var newTag = new Tag { Name = tagName, CategoryId = categoryId };
            _libraryService.AddOrUpdateTag(newTag);
            Log($"ItemTagsDialog.AddNewTag: Added tag '{tagName}' to category '{categoryId}'");

            // Add newly added tag to plus selection
            plusSelectedTags.Add(tagName);

            // Reload UI
            _libraryIndex = _libraryService.LibraryIndex;
            LoadTagsByCategory();

            // Restore selection states after reload
            foreach (var categoryVm in _categoryViewModels)
            {
                foreach (var tagVm in categoryVm.Tags)
                {
                    if (plusSelectedTags.Contains(tagVm.Tag))
                    {
                        tagVm.IsPlusSelected = true;
                        tagVm.IsMinusSelected = false;
                    }
                    else if (minusSelectedTags.Contains(tagVm.Tag))
                    {
                        tagVm.IsMinusSelected = true;
                        tagVm.IsPlusSelected = false;
                    }
                }
            }

            NewTagTextBox!.Text = "";
        }

        private void ShowLibraryServiceError()
        {
            Log($"ItemTagsDialog: ERROR - Library service is null, operation cannot proceed!");
            var errorDialog = new Window
            {
                Title = "Error: Cannot Save",
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
                Text = "Error: Cannot save changes",
                FontWeight = FontWeight.Bold,
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 12)
            };
            Grid.SetRow(titleText, 0);
            grid.Children.Add(titleText);
            
            var messageText = new TextBlock
            {
                Text = "Library service is not available. Changes cannot be saved and will be lost when the application closes.\n\nPlease cancel and try again later.",
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
        }

        private void OkButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Saving tags for {_items.Count} item(s)");
            
            // CRITICAL: Verify library service is available before attempting to save
            if (_libraryService == null)
            {
                ShowLibraryServiceError();
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

                // Process each tag view model in all categories
                foreach (var categoryVm in _categoryViewModels)
                {
                    foreach (var vm in categoryVm.Tags)
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

