using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;

namespace ReelRoulette
{
    public class CategoryViewModel : INotifyPropertyChanged
    {
        private bool _isExpanded = true;

        public TagCategory Category { get; set; } = new TagCategory();
        public ObservableCollection<ManageTagViewModel> Tags { get; set; } = new ObservableCollection<ManageTagViewModel>();

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
        public string TagCountDisplay => $"({Tags.Count} tag{(Tags.Count == 1 ? "" : "s")})";
        
        /// <summary>
        /// Returns true if this is a real category (not the synthetic "Uncategorized" category).
        /// Real categories can be reordered, renamed, and deleted.
        /// </summary>
        public bool IsReorderable => !string.IsNullOrEmpty(Category.Id);

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        public void RefreshTagCount()
        {
            OnPropertyChanged(nameof(TagCountDisplay));
        }
    }

    public class ManageTagViewModel
    {
        public Tag Tag { get; set; } = new Tag();
        public string CategoryId { get; set; } = string.Empty;
    }

    public partial class ManageTagsDialog : Window
    {
        private LibraryService? _libraryService;
        private System.Collections.Generic.List<FilterPreset>? _filterPresets;
        private ObservableCollection<CategoryViewModel> _categories = new ObservableCollection<CategoryViewModel>();

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public ManageTagsDialog(LibraryService? libraryService, System.Collections.Generic.List<FilterPreset>? filterPresets = null)
        {
            InitializeComponent();
            _libraryService = libraryService;
            _filterPresets = filterPresets;

            Log("ManageTagsDialog: Opening manage tags dialog");
            LoadCategoriesAndTags();
            UpdateCategoryComboBox();
        }

        private void LoadCategoriesAndTags()
        {
            _categories.Clear();

            var libraryIndex = _libraryService?.LibraryIndex;
            if (libraryIndex == null) return;

            var categories = libraryIndex.Categories ?? new System.Collections.Generic.List<TagCategory>();
            var tags = libraryIndex.Tags ?? new System.Collections.Generic.List<Tag>();

            // Get all tags from library items (to catch orphaned tags)
            var allItemTags = libraryIndex.Items
                .SelectMany(item => item.Tags ?? new System.Collections.Generic.List<string>())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            Log($"ManageTagsDialog.LoadCategoriesAndTags: Loading {categories.Count} categories, {tags.Count} defined tags, {allItemTags.Count} item tags");

            var processedTags = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var category in categories.OrderBy(c => c.SortOrder))
            {
                var categoryVm = new CategoryViewModel { Category = category };
                
                // Add tags for this category
                foreach (var tag in tags.Where(t => t.CategoryId == category.Id).OrderBy(t => t.Name))
                {
                    categoryVm.Tags.Add(new ManageTagViewModel 
                    { 
                        Tag = tag, 
                        CategoryId = category.Id 
                    });
                    processedTags.Add(tag.Name);
                }

                _categories.Add(categoryVm);
            }

            // Handle orphaned tags (tags on items but not in Tags list)
            var orphanedTags = allItemTags.Where(t => !processedTags.Contains(t)).ToList();
            if (orphanedTags.Count > 0)
            {
                Log($"ManageTagsDialog.LoadCategoriesAndTags: Found {orphanedTags.Count} orphaned tags");

                // Create an "Uncategorized" category for orphaned tags
                var uncategorizedCategory = new TagCategory
                {
                    Id = string.Empty,
                    Name = "Uncategorized",
                    SortOrder = int.MaxValue
                };

                var uncategorizedVm = new CategoryViewModel { Category = uncategorizedCategory };

                foreach (var tagName in orphanedTags.OrderBy(t => t))
                {
                    var orphanedTag = new Tag
                    {
                        Name = tagName,
                        CategoryId = string.Empty
                    };

                    uncategorizedVm.Tags.Add(new ManageTagViewModel
                    {
                        Tag = orphanedTag,
                        CategoryId = string.Empty
                    });
                }

                _categories.Add(uncategorizedVm);
            }

            CategoriesItemsControl.ItemsSource = _categories;
        }

        private void UpdateCategoryComboBox()
        {
            TagCategoryComboBox.Items.Clear();
            // Only include real categories (exclude synthetic "Uncategorized" with empty ID)
            foreach (var categoryVm in _categories.Where(c => !string.IsNullOrEmpty(c.Category.Id)))
            {
                TagCategoryComboBox.Items.Add(new ComboBoxItem
                {
                    Content = categoryVm.Category.Name,
                    Tag = categoryVm.Category.Id
                });
            }
            
            // Set default selection to first category if available
            if (TagCategoryComboBox.Items.Count > 0)
            {
                TagCategoryComboBox.SelectedIndex = 0;
            }
        }

        private void ToggleExpandButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is CategoryViewModel categoryVm)
            {
                categoryVm.IsExpanded = !categoryVm.IsExpanded;
                Log($"ManageTagsDialog.ToggleExpandButton_Click: Category '{categoryVm.Category.Name}' IsExpanded={categoryVm.IsExpanded}");
            }
        }

        private void MoveCategoryUpButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is CategoryViewModel categoryVm)
            {
                var index = _categories.IndexOf(categoryVm);
                if (index > 0)
                {
                    _categories.Move(index, index - 1);
                    UpdateSortOrders();
                    Log($"ManageTagsDialog.MoveCategoryUpButton_Click: Moved category '{categoryVm.Category.Name}' up");
                }
            }
        }

        private void MoveCategoryDownButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is CategoryViewModel categoryVm)
            {
                var index = _categories.IndexOf(categoryVm);
                if (index < _categories.Count - 1)
                {
                    _categories.Move(index, index + 1);
                    UpdateSortOrders();
                    Log($"ManageTagsDialog.MoveCategoryDownButton_Click: Moved category '{categoryVm.Category.Name}' down");
                }
            }
        }

        private void UpdateSortOrders()
        {
            int sortOrder = 0;
            for (int i = 0; i < _categories.Count; i++)
            {
                // Skip synthetic "Uncategorized" category when assigning sort orders
                if (string.IsNullOrEmpty(_categories[i].Category.Id))
                {
                    continue;
                }
                
                _categories[i].Category.SortOrder = sortOrder;
                sortOrder++;
            }
        }

        private async void EditCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is CategoryViewModel categoryVm)
            {
                Log($"ManageTagsDialog.EditCategoryButton_Click: Editing category '{categoryVm.Category.Name}'");
                
                var dialog = new Window
                {
                    Title = "Rename Category",
                    Width = 350,
                    Height = 150,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner
                };

                var textBox = new TextBox { Text = categoryVm.Category.Name, Margin = new Avalonia.Thickness(16, 16, 16, 8) };
                var buttonPanel = new StackPanel
                {
                    Orientation = Avalonia.Layout.Orientation.Horizontal,
                    HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                    Margin = new Avalonia.Thickness(16, 8, 16, 16),
                    Spacing = 8,
                    Children =
                    {
                        new Button { Content = "Cancel", MinWidth = 80 },
                        new Button { Content = "OK", MinWidth = 80, Classes = { "accent" } }
                    }
                };

                dialog.Content = new StackPanel
                {
                    Children = { textBox, buttonPanel }
                };

                (buttonPanel.Children[0] as Button)!.Click += (_, _) => dialog.Close();
                (buttonPanel.Children[1] as Button)!.Click += (_, _) =>
                {
                    var newName = textBox.Text?.Trim();
                    if (!string.IsNullOrEmpty(newName))
                    {
                        categoryVm.Category.Name = newName;
                        _libraryService?.AddOrUpdateCategory(categoryVm.Category);
                        LoadCategoriesAndTags(); // Refresh UI
                        UpdateCategoryComboBox();
                        Log($"ManageTagsDialog.EditCategoryButton_Click: Renamed category to '{newName}'");
                    }
                    dialog.Close();
                };

                await dialog.ShowDialog(this);
            }
        }

        private async void DeleteCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is CategoryViewModel categoryVm)
            {
                Log($"ManageTagsDialog.DeleteCategoryButton_Click: Deleting category '{categoryVm.Category.Name}'");

                if (categoryVm.Tags.Count > 0)
                {
                    // Show dialog to ask what to do with tags
                    var dialog = new Window
                    {
                        Title = "Delete Category",
                        Width = 400,
                        Height = 200,
                        WindowStartupLocation = WindowStartupLocation.CenterOwner
                    };

                    var message = new TextBlock
                    {
                        Text = $"Category '{categoryVm.Category.Name}' has {categoryVm.Tags.Count} tag(s). What would you like to do?",
                        TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                        Margin = new Avalonia.Thickness(16)
                    };

                    var buttonPanel = new StackPanel
                    {
                        Orientation = Avalonia.Layout.Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                        Spacing = 8,
                        Margin = new Avalonia.Thickness(16),
                        Children =
                        {
                            new Button { Content = "Cancel", MinWidth = 100 },
                            new Button { Content = "Delete All Tags", MinWidth = 120 },
                            new Button { Content = "Move Tags...", MinWidth = 100 }
                        }
                    };

                    dialog.Content = new StackPanel { Children = { message, buttonPanel } };

                    bool? result = null;
                    (buttonPanel.Children[0] as Button)!.Click += (_, _) => { result = null; dialog.Close(); };
                    (buttonPanel.Children[1] as Button)!.Click += (_, _) => { result = false; dialog.Close(); };
                    (buttonPanel.Children[2] as Button)!.Click += (_, _) => { result = true; dialog.Close(); };

                    await dialog.ShowDialog(this);

                    if (result == false)
                    {
                        // Delete all tags
                        _libraryService?.DeleteCategory(categoryVm.Category.Id, null);
                        Log($"ManageTagsDialog.DeleteCategoryButton_Click: Deleted category and all its tags");
                    }
                    else if (result == true)
                    {
                        // Move tags - show category selector
                        var moveDialog = new Window
                        {
                            Title = "Move Tags",
                            Width = 300,
                            Height = 150,
                            WindowStartupLocation = WindowStartupLocation.CenterOwner
                        };

                        var comboBox = new ComboBox { Margin = new Avalonia.Thickness(16), HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Stretch };
                        // Only include real categories (exclude synthetic "Uncategorized" and the category being deleted)
                        foreach (var otherCategory in _categories.Where(c => c.Category.Id != categoryVm.Category.Id && !string.IsNullOrEmpty(c.Category.Id)))
                        {
                            comboBox.Items.Add(new ComboBoxItem { Content = otherCategory.Category.Name, Tag = otherCategory.Category.Id });
                        }

                        var moveButtonPanel = new StackPanel
                        {
                            Orientation = Avalonia.Layout.Orientation.Horizontal,
                            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                            Margin = new Avalonia.Thickness(16),
                            Spacing = 8,
                            Children =
                            {
                                new Button { Content = "Cancel", MinWidth = 80 },
                                new Button { Content = "Move", MinWidth = 80 }
                            }
                        };

                        moveDialog.Content = new StackPanel { Children = { new TextBlock { Text = "Move tags to:", Margin = new Avalonia.Thickness(16, 16, 16, 8) }, comboBox, moveButtonPanel } };

                        string? targetCategoryId = null;
                        (moveButtonPanel.Children[0] as Button)!.Click += (_, _) => moveDialog.Close();
                        (moveButtonPanel.Children[1] as Button)!.Click += (_, _) =>
                        {
                            targetCategoryId = (comboBox.SelectedItem as ComboBoxItem)?.Tag as string;
                            moveDialog.Close();
                        };

                        await moveDialog.ShowDialog(this);

                        if (!string.IsNullOrEmpty(targetCategoryId))
                        {
                            _libraryService?.DeleteCategory(categoryVm.Category.Id, targetCategoryId);
                            Log($"ManageTagsDialog.DeleteCategoryButton_Click: Moved tags to category '{targetCategoryId}'");
                        }
                        else
                        {
                            return; // Cancelled
                        }
                    }
                    else
                    {
                        return; // Cancelled
                    }
                }
                else
                {
                    // No tags, just delete
                    _libraryService?.DeleteCategory(categoryVm.Category.Id, null);
                }

                LoadCategoriesAndTags();
                UpdateCategoryComboBox();
            }
        }

        private async void EditTagButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is ManageTagViewModel tagVm)
            {
                Log($"ManageTagsDialog.EditTagButton_Click: Editing tag '{tagVm.Tag.Name}'");

                var dialog = new EditTagDialog();
                // Filter out synthetic "Uncategorized" category (empty ID)
                var categories = _categories
                    .Where(c => !string.IsNullOrEmpty(c.Category.Id))
                    .Select(c => c.Category)
                    .ToList();
                dialog.Initialize(categories, tagVm.Tag.Name, tagVm.Tag.CategoryId);

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
                            SortOrder = _categories.Count
                        };
                        _libraryService?.AddOrUpdateCategory(newCategory);
                        Log($"ManageTagsDialog.EditTagButton_Click: Created new category '{newCategory.Name}'");
                    }

                    // Rename tag
                    string oldTagName = tagVm.Tag.Name;
                    string? newCategoryId = dialog.CategoryId != tagVm.Tag.CategoryId ? dialog.CategoryId : null;
                    _libraryService?.RenameTag(oldTagName, dialog.TagName, newCategoryId);
                    Log($"ManageTagsDialog.EditTagButton_Click: Renamed tag to '{dialog.TagName}'");

                    // Update filter presets if tag name changed
                    if (!string.Equals(oldTagName, dialog.TagName, StringComparison.OrdinalIgnoreCase))
                    {
                        int presetsUpdated = LibraryService.UpdateFilterPresetsForRenamedTag(_filterPresets, oldTagName, dialog.TagName);
                        Log($"ManageTagsDialog.EditTagButton_Click: Updated {presetsUpdated} filter presets");
                    }

                    LoadCategoriesAndTags();
                    UpdateCategoryComboBox();
                }
            }
        }

        private void DeleteTagButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is ManageTagViewModel tagVm)
            {
                Log($"ManageTagsDialog.DeleteTagButton_Click: Deleting tag '{tagVm.Tag.Name}'");
                string tagName = tagVm.Tag.Name;
                _libraryService?.DeleteTag(tagName);
                
                // Update filter presets
                int presetsUpdated = LibraryService.UpdateFilterPresetsForDeletedTag(_filterPresets, tagName);
                Log($"ManageTagsDialog.DeleteTagButton_Click: Updated {presetsUpdated} filter presets");
                
                LoadCategoriesAndTags();
                UpdateCategoryComboBox();
            }
        }

        private async void AddCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("ManageTagsDialog.AddCategoryButton_Click: Adding new category");

            var dialog = new Window
            {
                Title = "New Category",
                Width = 350,
                Height = 150,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var textBox = new TextBox { Watermark = "Category name", Margin = new Avalonia.Thickness(16, 16, 16, 8) };
            var buttonPanel = new StackPanel
            {
                Orientation = Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Margin = new Avalonia.Thickness(16, 8, 16, 16),
                Spacing = 8,
                Children =
                {
                    new Button { Content = "Cancel", MinWidth = 80 },
                    new Button { Content = "Add", MinWidth = 80, Classes = { "accent" } }
                }
            };

            dialog.Content = new StackPanel { Children = { textBox, buttonPanel } };

            string? newCategoryName = null;
            (buttonPanel.Children[0] as Button)!.Click += (_, _) => dialog.Close();
            (buttonPanel.Children[1] as Button)!.Click += (_, _) =>
            {
                newCategoryName = textBox.Text?.Trim();
                dialog.Close();
            };

            await dialog.ShowDialog(this);

            if (!string.IsNullOrEmpty(newCategoryName))
            {
                var newCategory = new TagCategory
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = newCategoryName,
                    SortOrder = _categories.Count
                };
                _libraryService?.AddOrUpdateCategory(newCategory);
                Log($"ManageTagsDialog.AddCategoryButton_Click: Created category '{newCategoryName}'");
                LoadCategoriesAndTags();
                UpdateCategoryComboBox();
            }
        }

        private void AddTagButton_Click(object? sender, RoutedEventArgs e)
        {
            AddTag();
        }

        private void NewTagTextBox_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                AddTag();
                e.Handled = true;
            }
        }

        private void AddTag()
        {
            var tagName = NewTagTextBox?.Text?.Trim();
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return;
            }

            var selectedItem = TagCategoryComboBox.SelectedItem as ComboBoxItem;
            if (selectedItem == null)
            {
                Log("ManageTagsDialog.AddTag: No category selected");
                return;
            }

            var categoryId = selectedItem.Tag as string;
            if (string.IsNullOrEmpty(categoryId))
            {
                return;
            }

            // Check if tag already exists (case-insensitive)
            var libraryIndex = _libraryService?.LibraryIndex;
            if (libraryIndex?.Tags != null)
            {
                if (libraryIndex.Tags.Any(t => string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase)))
                {
                    Log($"ManageTagsDialog.AddTag: Tag already exists: {tagName}");
                    return;
                }
            }

            var newTag = new Tag { Name = tagName, CategoryId = categoryId };
            _libraryService?.AddOrUpdateTag(newTag);
            Log($"ManageTagsDialog.AddTag: Added tag '{tagName}' to category '{categoryId}'");

            NewTagTextBox!.Text = "";
            LoadCategoriesAndTags();
        }

        private void CloseButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("ManageTagsDialog.CloseButton_Click: Saving library");
            
            // Update categories in library
            var libraryIndex = _libraryService?.LibraryIndex;
            if (libraryIndex != null)
            {
                if (libraryIndex.Categories == null)
                {
                    libraryIndex.Categories = new System.Collections.Generic.List<TagCategory>();
                }

                libraryIndex.Categories.Clear();
                foreach (var categoryVm in _categories)
                {
                    // Skip synthetic "Uncategorized" category (UI-only construct for orphaned tags)
                    if (string.IsNullOrEmpty(categoryVm.Category.Id))
                    {
                        Log($"ManageTagsDialog.CloseButton_Click: Skipping synthetic 'Uncategorized' category");
                        continue;
                    }
                    
                    libraryIndex.Categories.Add(categoryVm.Category);
                }
            }

            _libraryService?.SaveLibrary();
            Log("ManageTagsDialog: Library saved successfully");
            Close(true);
        }
    }
}

