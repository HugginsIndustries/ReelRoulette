using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;

namespace ReelRoulette
{
    public partial class ItemTagsDialog : Window
    {
        private LibraryItem _item;
        private LibraryIndex? _libraryIndex;
        private LibraryService? _libraryService;
        private ObservableCollection<TagViewModel> _tagViewModels = new ObservableCollection<TagViewModel>();

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public ItemTagsDialog(LibraryItem item, LibraryIndex? libraryIndex, LibraryService? libraryService)
        {
            InitializeComponent();
            _item = item;
            _libraryIndex = libraryIndex;
            _libraryService = libraryService;

            Log($"ItemTagsDialog: Opening tags dialog for: {item.FileName}");
            
            // Set title
            TitleTextBlock!.Text = $"Tags for {item.FileName}";

            // Load available tags and create view models
            var availableTags = _libraryIndex?.AvailableTags ?? new List<string>();
            var itemTags = _item.Tags ?? new List<string>();

            foreach (var tag in availableTags.OrderBy(t => t))
            {
                _tagViewModels.Add(new TagViewModel
                {
                    Tag = tag,
                    IsSelected = itemTags.Any(it => string.Equals(it, tag, StringComparison.OrdinalIgnoreCase))
                });
            }

            TagsItemsControl!.ItemsSource = _tagViewModels;
        }

        private void TagToggleButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is ToggleButton toggleButton && toggleButton.DataContext is TagViewModel viewModel)
            {
                viewModel.IsSelected = toggleButton.IsChecked == true;
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
                // Tag exists, just toggle it on
                existing.IsSelected = true;
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
            var newViewModel = new TagViewModel
            {
                Tag = tagName,
                IsSelected = true
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
            Log($"ItemTagsDialog: Saving tags for: {_item.FileName}");
            
            // Ensure Tags list exists
            if (_item.Tags == null)
            {
                _item.Tags = new List<string>();
            }

            // Update item tags from selected view models
            var oldTags = _item.Tags.ToList();
            _item.Tags.Clear();
            foreach (var vm in _tagViewModels.Where(vm => vm.IsSelected))
            {
                _item.Tags.Add(vm.Tag);
            }

            Log($"ItemTagsDialog: Tags updated - Old: [{string.Join(", ", oldTags)}], New: [{string.Join(", ", _item.Tags)}]");

            // Update library item
            _libraryService?.UpdateItem(_item);
            _libraryService?.SaveLibrary();

            Log($"ItemTagsDialog: Tags saved successfully for: {_item.FileName}");
            Close(true);
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ItemTagsDialog: Cancelled tags dialog for: {_item.FileName}");
            Close(false);
        }
    }
}

