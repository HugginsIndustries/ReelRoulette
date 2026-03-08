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
        public const string UncategorizedCategoryId = "uncategorized";
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
        public bool IsReorderable =>
            !string.IsNullOrWhiteSpace(CategoryId) &&
            !string.Equals(CategoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);

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
        public bool IsSelectionEnabled { get; set; } = true;

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
        private readonly ITagMutationClient _tagMutationClient;
        private readonly HashSet<string> _pendingDeletedCategoryIds = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _pendingDeletedTagNames = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Tag> _pendingUpsertTags = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, (string OldName, string NewName, string? NewCategoryId)> _pendingRenameTags = new(StringComparer.OrdinalIgnoreCase);
        private List<string> _baselineCategoryOrder = [];
        private Dictionary<string, string> _baselineCategoryNames = new(StringComparer.OrdinalIgnoreCase);

        private static void Log(string message)
        {
            ClientLogRelay.Log("desktop-item-tags-dialog", message);
        }

        public ItemTagsDialog(
            List<LibraryItem> items,
            LibraryIndex? libraryIndex,
            LibraryService? libraryService,
            ITagMutationClient tagMutationClient,
            System.Collections.Generic.List<FilterPreset>? filterPresets = null)
        {
            InitializeComponent();
            _items = CloneItemsForEditor(items);
            _libraryIndex = CloneLibraryIndexForEditor(libraryIndex);
            _libraryService = libraryService;
            _filterPresets = filterPresets;
            _tagMutationClient = tagMutationClient ?? throw new ArgumentNullException(nameof(tagMutationClient));

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

            CategoriesItemsControl.ItemsSource = _categoryViewModels;
        }

        private async void OnOpened(object? sender, EventArgs e)
        {
            // Set position after window is fully opened and laid out (Avalonia best practice)
            if (_savedPosition.HasValue)
            {
                Position = _savedPosition.Value;
                Log($"ItemTagsDialog: Position set to ({_savedPosition.Value.X}, {_savedPosition.Value.Y}) after window opened");
            }

            await RefreshTagEditorModelAsync();
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

            var categories = (_libraryIndex?.Categories ?? new List<TagCategory>())
                .Where(c => !string.IsNullOrWhiteSpace(c.Name))
                .Where(c => !_pendingDeletedCategoryIds.Contains(c.Id ?? string.Empty))
                .Select(c => new TagCategory
                {
                    Id = string.IsNullOrWhiteSpace(c.Id) ? ItemTagsCategoryViewModel.UncategorizedCategoryId : c.Id,
                    Name = string.Equals(c.Id, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)
                        ? "Uncategorized"
                        : c.Name,
                    SortOrder = c.SortOrder
                })
                .GroupBy(c => c.Id, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.OrderBy(c => c.SortOrder).First())
                .ToList();

            if (!categories.Any(c => string.Equals(c.Id, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)))
            {
                categories.Add(new TagCategory
                {
                    Id = ItemTagsCategoryViewModel.UncategorizedCategoryId,
                    Name = "Uncategorized",
                    SortOrder = int.MaxValue
                });
            }

            var availableTags = (_libraryIndex?.Tags ?? new List<Tag>())
                .Where(t => !string.IsNullOrWhiteSpace(t.Name))
                .Select(t => new Tag
                {
                    Name = t.Name,
                    CategoryId = string.IsNullOrWhiteSpace(t.CategoryId) ? ItemTagsCategoryViewModel.UncategorizedCategoryId : t.CategoryId
                })
                .ToList();

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
                    if (availableTag != null && string.Equals(availableTag.CategoryId, category.Id, StringComparison.OrdinalIgnoreCase))
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
                            IsSelectionEnabled = _items.Count > 0,
                            TagState = tagState,
                            IsPlusSelected = false,
                            IsMinusSelected = false
                        });

                        processedTags.Add(tagName);
                    }
                }

                var isUncategorized = string.Equals(categoryVm.CategoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
                if (!isUncategorized || categoryVm.Tags.Count > 0)
                {
                    _categoryViewModels.Add(categoryVm);
                }
            }

            // Handle orphaned tags (tags on items but not defined in any category)
            var orphanedTags = allTagNames.Where(t => !processedTags.Contains(t)).ToList();
            if (orphanedTags.Count > 0)
            {
                Log($"ItemTagsDialog.LoadTagsByCategory: Found {orphanedTags.Count} orphaned tags");

                var orphanedCategoryVm = _categoryViewModels.FirstOrDefault(c =>
                    string.Equals(c.CategoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
                    ?? new ItemTagsCategoryViewModel
                {
                    CategoryId = ItemTagsCategoryViewModel.UncategorizedCategoryId,
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
                        CategoryId = ItemTagsCategoryViewModel.UncategorizedCategoryId,
                        IsSelectionEnabled = _items.Count > 0,
                        TagState = tagState,
                        IsPlusSelected = false,
                        IsMinusSelected = false
                    });
                }

                if (!_categoryViewModels.Any(c => ReferenceEquals(c, orphanedCategoryVm)))
                {
                    _categoryViewModels.Add(orphanedCategoryVm);
                }
            }

            CategoriesItemsControl.ItemsSource = _categoryViewModels;
            UpdateApplyButtonState();
        }

        private void UpdateCategoryComboBox()
        {
            TagCategoryComboBox.Items.Clear();
            var categories = _categoryViewModels
                .Select((c, index) => new TagCategory
                {
                    Id = c.CategoryId,
                    Name = c.CategoryName,
                    SortOrder = index
                })
                .ToList();
            if (!categories.Any(c => string.Equals(c.Id, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)))
            {
                categories.Add(new TagCategory
                {
                    Id = ItemTagsCategoryViewModel.UncategorizedCategoryId,
                    Name = "Uncategorized",
                    SortOrder = int.MaxValue
                });
            }

            foreach (var category in categories)
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

        private void MoveCategoryUpButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.CommandParameter is not ItemTagsCategoryViewModel categoryVm || !categoryVm.IsReorderable)
            {
                return;
            }

            var movableWithIndices = _categoryViewModels
                .Select((category, index) => new { category, index })
                .Where(x => x.category.IsReorderable)
                .ToList();
            var currentPosition = movableWithIndices.FindIndex(x => ReferenceEquals(x.category, categoryVm));
            if (currentPosition <= 0)
            {
                return;
            }

            var sourceIndex = movableWithIndices[currentPosition].index;
            var targetIndex = movableWithIndices[currentPosition - 1].index;
            _categoryViewModels.Move(sourceIndex, targetIndex);
            SyncLibraryIndexFromViewModels();
            UpdateCategoryComboBox();
            Log($"ItemTagsDialog.MoveCategoryUpButton_Click: Queued reorder for category '{categoryVm.CategoryName}'");
            UpdateApplyButtonState();
        }

        private void MoveCategoryDownButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.CommandParameter is not ItemTagsCategoryViewModel categoryVm || !categoryVm.IsReorderable)
            {
                return;
            }

            var movableWithIndices = _categoryViewModels
                .Select((category, index) => new { category, index })
                .Where(x => x.category.IsReorderable)
                .ToList();
            var currentPosition = movableWithIndices.FindIndex(x => ReferenceEquals(x.category, categoryVm));
            if (currentPosition < 0 || currentPosition >= movableWithIndices.Count - 1)
            {
                return;
            }

            var sourceIndex = movableWithIndices[currentPosition].index;
            var targetIndex = movableWithIndices[currentPosition + 1].index;
            _categoryViewModels.Move(sourceIndex, targetIndex);
            SyncLibraryIndexFromViewModels();
            UpdateCategoryComboBox();
            Log($"ItemTagsDialog.MoveCategoryDownButton_Click: Queued reorder for category '{categoryVm.CategoryName}'");
            UpdateApplyButtonState();
        }

        private async void DeleteCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.CommandParameter is not ItemTagsCategoryViewModel categoryVm || !categoryVm.IsReorderable)
            {
                return;
            }

            var confirmed = await ShowDeleteCategoryWarningAsync(categoryVm);
            if (!confirmed)
            {
                return;
            }

            _pendingDeletedCategoryIds.Add(categoryVm.CategoryId);

            var uncategorizedCategory = _categoryViewModels.FirstOrDefault(c =>
                string.Equals(c.CategoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase));
            if (uncategorizedCategory == null)
            {
                uncategorizedCategory = new ItemTagsCategoryViewModel
                {
                    CategoryId = ItemTagsCategoryViewModel.UncategorizedCategoryId,
                    CategoryName = "Uncategorized"
                };
                _categoryViewModels.Add(uncategorizedCategory);
            }

            foreach (var tag in categoryVm.Tags)
            {
                if (uncategorizedCategory.Tags.Any(existing =>
                        string.Equals(existing.Tag, tag.Tag, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                tag.CategoryId = ItemTagsCategoryViewModel.UncategorizedCategoryId;
                uncategorizedCategory.Tags.Add(tag);
            }

            _categoryViewModels.Remove(categoryVm);
            SyncLibraryIndexFromViewModels();
            UpdateCategoryComboBox();
            Log($"ItemTagsDialog.DeleteCategoryButton_Click: Queued delete for category '{categoryVm.CategoryName}'");
            UpdateApplyButtonState();
        }

        private async System.Threading.Tasks.Task<bool> ShowDeleteCategoryWarningAsync(ItemTagsCategoryViewModel categoryVm)
        {
            var dialog = new Window
            {
                Title = "Delete Category",
                Width = 420,
                Height = 180,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var message = new TextBlock
            {
                Text = $"Delete category '{categoryVm.CategoryName}'? Tags will become Uncategorized when you click Apply.",
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(16, 16, 16, 8)
            };

            var buttonPanel = new StackPanel
            {
                Orientation = Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Margin = new Thickness(16, 8, 16, 16),
                Spacing = 8,
                Children =
                {
                    new Button { Content = "Cancel", MinWidth = 90 },
                    new Button { Content = "Delete", MinWidth = 90, Classes = { "accent" } }
                }
            };

            dialog.Content = new StackPanel { Children = { message, buttonPanel } };

            var confirmed = false;
            (buttonPanel.Children[0] as Button)!.Click += (_, _) => dialog.Close();
            (buttonPanel.Children[1] as Button)!.Click += (_, _) =>
            {
                confirmed = true;
                dialog.Close();
            };

            await dialog.ShowDialog(this);
            return confirmed;
        }

        private async System.Threading.Tasks.Task<bool> ApplyPendingCategoryMutationsAsync()
        {
            foreach (var categoryId in _pendingDeletedCategoryIds)
            {
                var accepted = await _tagMutationClient.DeleteCategoryAsync(categoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId);
                if (!accepted)
                {
                    ShowApiRequiredError();
                    return false;
                }
            }

            var orderedCategories = _categoryViewModels
                .Where(c => c.IsReorderable)
                .ToList();
            for (var i = 0; i < orderedCategories.Count; i++)
            {
                var categoryVm = orderedCategories[i];
                var accepted = await _tagMutationClient.UpsertCategoryAsync(new TagCategory
                {
                    Id = categoryVm.CategoryId,
                    Name = categoryVm.CategoryName,
                    SortOrder = i
                });
                if (!accepted)
                {
                    ShowApiRequiredError();
                    return false;
                }
            }

            _pendingDeletedCategoryIds.Clear();
            return true;
        }

        private async System.Threading.Tasks.Task<bool> ApplyPendingTagMutationsAsync()
        {
            foreach (var tagName in _pendingDeletedTagNames.ToList())
            {
                var deleted = await _tagMutationClient.DeleteTagAsync(tagName);
                if (!deleted)
                {
                    ShowApiRequiredError();
                    return false;
                }

                _ = LibraryService.UpdateFilterPresetsForDeletedTag(_filterPresets, tagName);
            }

            foreach (var rename in _pendingRenameTags.Values.ToList())
            {
                var renamed = await _tagMutationClient.RenameTagAsync(rename.OldName, rename.NewName, rename.NewCategoryId);
                if (!renamed)
                {
                    ShowApiRequiredError();
                    return false;
                }

                if (!string.Equals(rename.OldName, rename.NewName, StringComparison.OrdinalIgnoreCase))
                {
                    _ = LibraryService.UpdateFilterPresetsForRenamedTag(_filterPresets, rename.OldName, rename.NewName);
                }
            }

            foreach (var upsert in _pendingUpsertTags.Values.ToList())
            {
                var upserted = await _tagMutationClient.UpsertTagAsync(upsert.Name, upsert.CategoryId);
                if (!upserted)
                {
                    ShowApiRequiredError();
                    return false;
                }
            }

            _pendingDeletedTagNames.Clear();
            _pendingRenameTags.Clear();
            _pendingUpsertTags.Clear();
            return true;
        }

        private bool CategoryNameExists(string name, string? exceptCategoryId = null)
        {
            var normalized = (name ?? string.Empty).Trim();
            return _categoryViewModels.Any(c =>
                !string.Equals(c.CategoryId, exceptCategoryId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals((c.CategoryName ?? string.Empty).Trim(), normalized, StringComparison.OrdinalIgnoreCase));
        }

        private async System.Threading.Tasks.Task ShowCategoryExistsWarningAsync()
        {
            var dialog = new Window
            {
                Title = "Category exists",
                Width = 360,
                Height = 150,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };
            var text = new TextBlock
            {
                Text = "Category already exists.",
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(16, 16, 16, 8)
            };
            var ok = new Button
            {
                Content = "OK",
                MinWidth = 80,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Margin = new Thickness(16)
            };
            ok.Click += (_, _) => dialog.Close();
            dialog.Content = new StackPanel { Children = { text, ok } };
            await dialog.ShowDialog(this);
        }

        private async System.Threading.Tasks.Task<bool> RefreshTagEditorModelAsync()
        {
            var model = await _tagMutationClient.GetTagEditorModelAsync(_items.Select(i => i.FullPath).ToList());
            if (model == null)
            {
                ShowApiRequiredError();
                return false;
            }

            if (_libraryIndex != null)
            {
                _libraryIndex.Categories = model.Categories
                    .Select(c => new TagCategory
                    {
                        Id = string.IsNullOrWhiteSpace(c.Id) ? ItemTagsCategoryViewModel.UncategorizedCategoryId : c.Id,
                        Name = c.Name,
                        SortOrder = c.SortOrder
                    })
                    .ToList();
                _libraryIndex.Tags = model.Tags
                    .Select(t => new Tag
                    {
                        Name = t.Name,
                        CategoryId = string.IsNullOrWhiteSpace(t.CategoryId) ? ItemTagsCategoryViewModel.UncategorizedCategoryId : t.CategoryId
                    })
                    .ToList();
            }

            var itemsById = model.Items.ToDictionary(i => i.ItemId, StringComparer.OrdinalIgnoreCase);
            foreach (var item in _items)
            {
                if (itemsById.TryGetValue(item.FullPath, out var snapshot))
                {
                    item.Tags = snapshot.Tags?.ToList() ?? [];
                }
            }

            _pendingDeletedCategoryIds.Clear();
            _pendingDeletedTagNames.Clear();
            _pendingRenameTags.Clear();
            _pendingUpsertTags.Clear();
            LoadTagsByCategory();
            UpdateCategoryComboBox();
            _baselineCategoryOrder = GetCurrentReorderableCategoryOrder();
            _baselineCategoryNames = GetCurrentCategoryNames();
            UpdateApplyButtonState();
            return true;
        }

        private void UpdateApplyButtonState()
        {
            var hasItemTagSelections = _categoryViewModels.Any(c => c.Tags.Any(t => t.IsPlusSelected || t.IsMinusSelected));
            var hasCategoryOrderChanges = !GetCurrentReorderableCategoryOrder().SequenceEqual(_baselineCategoryOrder, StringComparer.OrdinalIgnoreCase);
            var currentCategoryNames = GetCurrentCategoryNames();
            var hasCategoryNameChanges = !_baselineCategoryNames.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
                .SequenceEqual(currentCategoryNames.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase));
            var hasPendingChanges = hasItemTagSelections
                || hasCategoryOrderChanges
                || hasCategoryNameChanges
                || _pendingDeletedCategoryIds.Count > 0
                || _pendingDeletedTagNames.Count > 0
                || _pendingRenameTags.Count > 0
                || _pendingUpsertTags.Count > 0;
            if (ApplyButton != null)
            {
                ApplyButton.IsEnabled = hasPendingChanges;
            }
        }

        private List<string> GetCurrentReorderableCategoryOrder()
        {
            return _categoryViewModels
                .Where(c => c.IsReorderable)
                .Select(c => c.CategoryId)
                .ToList();
        }

        private Dictionary<string, string> GetCurrentCategoryNames()
        {
            return _categoryViewModels
                .ToDictionary(c => c.CategoryId, c => c.CategoryName ?? string.Empty, StringComparer.OrdinalIgnoreCase);
        }

        private void SyncLibraryIndexFromViewModels()
        {
            if (_libraryIndex == null)
            {
                return;
            }

            _libraryIndex.Categories = _categoryViewModels
                .Select((c, index) => new TagCategory
                {
                    Id = c.CategoryId,
                    Name = c.CategoryName,
                    SortOrder = string.Equals(c.CategoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)
                        ? int.MaxValue
                        : index
                })
                .GroupBy(c => c.Id, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .ToList();

            _libraryIndex.Tags = _categoryViewModels
                .SelectMany(c => c.Tags.Select(t => new Tag
                {
                    Name = t.Tag,
                    CategoryId = c.CategoryId
                }))
                .GroupBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .ToList();
        }

        private async void EditCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.CommandParameter is not ItemTagsCategoryViewModel categoryVm || !categoryVm.IsReorderable)
            {
                return;
            }

            var dialog = new Window
            {
                Title = "Rename Category",
                Width = 350,
                Height = 150,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var textBox = new TextBox { Text = categoryVm.CategoryName, Margin = new Thickness(16, 16, 16, 8) };
            var buttonPanel = new StackPanel
            {
                Orientation = Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Margin = new Thickness(16, 8, 16, 16),
                Spacing = 8,
                Children =
                {
                    new Button { Content = "Cancel", MinWidth = 80 },
                    new Button { Content = "OK", MinWidth = 80, Classes = { "accent" } }
                }
            };
            dialog.Content = new StackPanel { Children = { textBox, buttonPanel } };
            bool accepted = false;
            (buttonPanel.Children[0] as Button)!.Click += (_, _) => dialog.Close();
            (buttonPanel.Children[1] as Button)!.Click += (_, _) => { accepted = true; dialog.Close(); };
            await dialog.ShowDialog(this);
            if (!accepted)
            {
                return;
            }

            var newName = textBox.Text?.Trim();
            if (string.IsNullOrWhiteSpace(newName))
            {
                return;
            }
            if (CategoryNameExists(newName, categoryVm.CategoryId))
            {
                await ShowCategoryExistsWarningAsync();
                return;
            }

            categoryVm.CategoryName = newName;
            SyncLibraryIndexFromViewModels();
            LoadTagsByCategory();
            UpdateCategoryComboBox();
            UpdateApplyButtonState();
        }

        private async void AddCategoryButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("ItemTagsDialog.AddCategoryButton_Click: Adding new category");

            var dialog = new Window
            {
                Title = "New Category",
                Width = 350,
                Height = 150,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var textBox = new TextBox { Watermark = "Category name", Margin = new Thickness(16, 16, 16, 8) };
            var buttonPanel = new StackPanel
            {
                Orientation = Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Margin = new Thickness(16, 8, 16, 16),
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

            if (string.IsNullOrEmpty(newCategoryName))
            {
                return;
            }

            if (CategoryNameExists(newCategoryName))
            {
                await ShowCategoryExistsWarningAsync();
                return;
            }

            var categoryCount = _categoryViewModels.Count(c => c.IsReorderable);
            var newCategory = new TagCategory
            {
                Id = Guid.NewGuid().ToString(),
                Name = newCategoryName,
                SortOrder = categoryCount
            };

            _categoryViewModels.Add(new ItemTagsCategoryViewModel
            {
                CategoryId = newCategory.Id,
                CategoryName = newCategory.Name
            });
            SyncLibraryIndexFromViewModels();
            UpdateCategoryComboBox();
            UpdateApplyButtonState();
        }

        private async void RefreshButton_Click(object? sender, RoutedEventArgs e)
        {
            await RefreshTagEditorModelAsync();
            Log("ItemTagsDialog.RefreshButton_Click: Reloaded tag editor model from API and cleared staged changes");
        }

        private void CloseButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Closed without apply for {_items.Count} item(s)");
            Close(false);
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
                    string oldTagName = tagVm.Tag;
                    string newTagName = dialog.TagName;
                    string newCategoryId = dialog.CategoryId;
                    if (_pendingUpsertTags.TryGetValue(oldTagName, out var pendingUpsert))
                    {
                        // Tag is staged-only (not yet persisted). Keep it as upsert mutation
                        // so apply does not attempt a rename on a non-existent server tag.
                        _pendingUpsertTags.Remove(oldTagName);
                        pendingUpsert.Name = newTagName;
                        pendingUpsert.CategoryId = newCategoryId;
                        _pendingUpsertTags[newTagName] = pendingUpsert;
                        _pendingDeletedTagNames.Remove(oldTagName);
                        _pendingDeletedTagNames.Remove(newTagName);
                        _pendingRenameTags.Remove(oldTagName);
                        Log($"ItemTagsDialog.EditTagButton_Click: Updated staged new tag '{oldTagName}' -> '{newTagName}'");
                    }
                    else
                    {
                        _pendingRenameTags[oldTagName] = (oldTagName, newTagName, newCategoryId);
                        _pendingDeletedTagNames.Remove(oldTagName);
                        _pendingUpsertTags.Remove(oldTagName);
                        _pendingUpsertTags.Remove(newTagName);
                        Log($"ItemTagsDialog.EditTagButton_Click: Queued rename tag '{oldTagName}' -> '{newTagName}'");
                    }

                    // Defer filter preset updates until Apply succeeds.

                    // Reload the UI from current local projection.
                    foreach (var item in _items)
                    {
                        item.Tags ??= [];
                        var itemTagSet = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);
                        if (itemTagSet.Remove(oldTagName))
                        {
                            itemTagSet.Add(newTagName);
                        }
                        item.Tags = itemTagSet.OrderBy(t => t, StringComparer.OrdinalIgnoreCase).ToList();
                    }

                    BatchTagViewModel? movedTag = null;
                    ItemTagsCategoryViewModel? sourceCategory = null;
                    foreach (var categoryVm in _categoryViewModels)
                    {
                        var match = categoryVm.Tags.FirstOrDefault(t => string.Equals(t.Tag, oldTagName, StringComparison.OrdinalIgnoreCase));
                        if (match != null)
                        {
                            movedTag = match;
                            sourceCategory = categoryVm;
                            break;
                        }
                    }

                    if (movedTag != null && sourceCategory != null)
                    {
                        sourceCategory.Tags.Remove(movedTag);
                        movedTag.Tag = newTagName;
                        movedTag.CategoryId = newCategoryId;

                        var targetCategory = _categoryViewModels.FirstOrDefault(c =>
                            string.Equals(c.CategoryId, newCategoryId, StringComparison.OrdinalIgnoreCase));
                        if (targetCategory == null)
                        {
                            var targetCategoryName = _libraryIndex?.Categories?
                                .FirstOrDefault(c => string.Equals(c.Id, newCategoryId, StringComparison.OrdinalIgnoreCase))?.Name
                                ?? (string.Equals(newCategoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)
                                    ? "Uncategorized"
                                    : newCategoryId);
                            targetCategory = new ItemTagsCategoryViewModel
                            {
                                CategoryId = newCategoryId,
                                CategoryName = targetCategoryName
                            };
                            _categoryViewModels.Add(targetCategory);
                        }

                        if (!targetCategory.Tags.Any(t => string.Equals(t.Tag, movedTag.Tag, StringComparison.OrdinalIgnoreCase)))
                        {
                            targetCategory.Tags.Add(movedTag);
                        }
                    }
                    SyncLibraryIndexFromViewModels();
                    LoadTagsByCategory();
                    UpdateCategoryComboBox();
                    UpdateApplyButtonState();
                }
            }
        }

        private async void DeleteTagButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.CommandParameter is not BatchTagViewModel tagVm)
            {
                return;
            }

            var tagName = tagVm.Tag;
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return;
            }

            var confirmed = await ShowDeleteTagWarningAsync(tagName);
            if (!confirmed)
            {
                return;
            }

            string deleteTagName = tagName;
            var renameKeysToRemove = _pendingRenameTags
                .Where(kv =>
                    string.Equals(kv.Key, tagName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(kv.Value.NewName, tagName, StringComparison.OrdinalIgnoreCase))
                .Select(kv => kv.Key)
                .ToList();
            foreach (var renameKey in renameKeysToRemove)
            {
                var rename = _pendingRenameTags[renameKey];
                if (string.Equals(rename.NewName, tagName, StringComparison.OrdinalIgnoreCase))
                {
                    // Rename old->new was staged, then new was deleted before apply.
                    // Delete should target the original backend tag name.
                    deleteTagName = rename.OldName;
                }
                _pendingRenameTags.Remove(renameKey);
            }

            var removedPendingUpsert =
                _pendingUpsertTags.Remove(tagName) |
                _pendingUpsertTags.Remove(deleteTagName);
            if (!removedPendingUpsert)
            {
                _pendingDeletedTagNames.Add(deleteTagName);
            }

            Log($"ItemTagsDialog.DeleteTagButton_Click: Queued delete '{deleteTagName}'");

            foreach (var categoryVm in _categoryViewModels.ToList())
            {
                var match = categoryVm.Tags.FirstOrDefault(t => string.Equals(t.Tag, tagName, StringComparison.OrdinalIgnoreCase));
                if (match != null)
                {
                    categoryVm.Tags.Remove(match);
                }
            }
            SyncLibraryIndexFromViewModels();
            LoadTagsByCategory();
            UpdateCategoryComboBox();
            UpdateApplyButtonState();
        }

        private async System.Threading.Tasks.Task<bool> ShowDeleteTagWarningAsync(string tagName)
        {
            var dialog = new Window
            {
                Title = "Delete Tag",
                Width = 360,
                Height = 150,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var message = new TextBlock
            {
                Text = $"Delete tag '{tagName}'?",
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(16, 16, 16, 8)
            };

            var buttonPanel = new StackPanel
            {
                Orientation = Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Margin = new Thickness(16, 8, 16, 16),
                Spacing = 8,
                Children =
                {
                    new Button { Content = "Cancel", MinWidth = 90 },
                    new Button { Content = "Delete", MinWidth = 90, Classes = { "accent" } }
                }
            };

            dialog.Content = new StackPanel { Children = { message, buttonPanel } };

            var confirmed = false;
            (buttonPanel.Children[0] as Button)!.Click += (_, _) => dialog.Close();
            (buttonPanel.Children[1] as Button)!.Click += (_, _) =>
            {
                confirmed = true;
                dialog.Close();
            };

            await dialog.ShowDialog(this);
            return confirmed;
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
                UpdateApplyButtonState();
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
                UpdateApplyButtonState();
            }
        }

        private async void AddTagButton_Click(object? sender, RoutedEventArgs e)
        {
            await AddNewTagAsync();
        }

        private async void NewTagTextBox_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                await AddNewTagAsync();
                e.Handled = true;
            }
        }

        private async System.Threading.Tasks.Task AddNewTagAsync()
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
            categoryId = string.IsNullOrWhiteSpace(categoryId)
                ? ItemTagsCategoryViewModel.UncategorizedCategoryId
                : categoryId;

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
                        if (_items.Count > 0)
                        {
                            tagVm.IsPlusSelected = true;
                            tagVm.IsMinusSelected = false;
                        }
                        NewTagTextBox!.Text = "";
                        UpdateApplyButtonState();
                        return;
                    }
                }
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

            // Queue new tag for apply.
            _pendingUpsertTags[tagName] = new Tag
            {
                Name = tagName,
                CategoryId = categoryId
            };
            _pendingDeletedTagNames.Remove(tagName);
            Log($"ItemTagsDialog.AddNewTag: Queued tag '{tagName}' to category '{categoryId}'");

            // Add newly added tag to plus selection
            plusSelectedTags.Add(tagName);

            var existingCategory = _categoryViewModels.FirstOrDefault(c => string.Equals(c.CategoryId, categoryId, StringComparison.OrdinalIgnoreCase));
            if (existingCategory == null)
            {
                existingCategory = new ItemTagsCategoryViewModel
                {
                    CategoryId = categoryId,
                    CategoryName = string.Equals(categoryId, ItemTagsCategoryViewModel.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)
                        ? "Uncategorized"
                        : categoryId
                };
                _categoryViewModels.Add(existingCategory);
            }
            if (!existingCategory.Tags.Any(t => string.Equals(t.Tag, tagName, StringComparison.OrdinalIgnoreCase)))
            {
                existingCategory.Tags.Add(new BatchTagViewModel
                {
                    Tag = tagName,
                    CategoryId = categoryId,
                    IsSelectionEnabled = _items.Count > 0,
                    TagState = TagState.NoItemsHaveTag,
                    IsPlusSelected = _items.Count > 0
                });
            }
            SyncLibraryIndexFromViewModels();
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
            UpdateApplyButtonState();
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

        private void ShowApiRequiredError()
        {
            Log("ItemTagsDialog: API-required mutation failed; core API unavailable or request rejected.");
            var errorDialog = new Window
            {
                Title = "Tag Update Failed",
                Width = 460,
                Height = 190,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.Margin = new Thickness(16);

            var titleText = new TextBlock
            {
                Text = "API required",
                FontWeight = FontWeight.Bold,
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 12)
            };
            Grid.SetRow(titleText, 0);
            grid.Children.Add(titleText);

            var messageText = new TextBlock
            {
                Text = "Tag changes now require the core API. Ensure core is running and try again.",
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

        private async void OkButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Saving tags for {_items.Count} item(s)");
            
            // CRITICAL: Verify library service is available before attempting to save
            if (_libraryService == null)
            {
                ShowLibraryServiceError();
                return;
            }
            
            var categoryMutationsAccepted = await ApplyPendingCategoryMutationsAsync();
            if (!categoryMutationsAccepted)
            {
                return;
            }

            var tagMutationsAccepted = await ApplyPendingTagMutationsAsync();
            if (!tagMutationsAccepted)
            {
                return;
            }

            // Build batch item-tag deltas and apply through API.
            var addTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var removeTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var categoryVm in _categoryViewModels)
            {
                foreach (var vm in categoryVm.Tags)
                {
                    if (vm.IsPlusSelected)
                    {
                        addTags.Add(vm.Tag);
                    }
                    else if (vm.IsMinusSelected)
                    {
                        removeTags.Add(vm.Tag);
                    }
                }
            }

            var itemIds = _items.Select(i => i.FullPath).ToList();
            if (itemIds.Count > 0 && (addTags.Count > 0 || removeTags.Count > 0))
            {
                var accepted = await _tagMutationClient.ApplyItemTagDeltaAsync(itemIds, addTags.ToList(), removeTags.ToList());
                if (!accepted)
                {
                    ShowApiRequiredError();
                    return;
                }
            }

            Log($"ItemTagsDialog: API tag delta applied for {itemIds.Count} item(s)");
            Close(true);
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Cancelled tags dialog for {_items.Count} item(s)");
            Close(false);
        }

        private static List<LibraryItem> CloneItemsForEditor(List<LibraryItem>? items)
        {
            if (items == null || items.Count == 0)
            {
                return [];
            }

            return items.Select(item => new LibraryItem
            {
                Id = item.Id,
                FullPath = item.FullPath,
                FileName = item.FileName,
                Tags = (item.Tags ?? []).ToList()
            }).ToList();
        }

        private static LibraryIndex CloneLibraryIndexForEditor(LibraryIndex? source)
        {
            if (source == null)
            {
                return new LibraryIndex
                {
                    Categories = [],
                    Tags = []
                };
            }

            return new LibraryIndex
            {
                Categories = (source.Categories ?? [])
                    .Select(c => new TagCategory
                    {
                        Id = c.Id,
                        Name = c.Name,
                        SortOrder = c.SortOrder
                    })
                    .ToList(),
                Tags = (source.Tags ?? [])
                    .Select(t => new Tag
                    {
                        Name = t.Name,
                        CategoryId = t.CategoryId
                    })
                    .ToList()
            };
        }
    }
}

