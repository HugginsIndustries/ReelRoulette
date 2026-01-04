using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;

namespace ReelRoulette
{
    public partial class ManageTagsDialog : Window
    {
        private LibraryIndex? _libraryIndex;
        private LibraryService? _libraryService;
        public ObservableCollection<string> Tags { get; } = new ObservableCollection<string>();

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public ManageTagsDialog(LibraryIndex? libraryIndex, LibraryService? libraryService)
        {
            InitializeComponent();
            _libraryIndex = libraryIndex;
            _libraryService = libraryService;
            DataContext = this;

            Log("ManageTagsDialog: Opening manage tags dialog");

            // Load existing tags
            if (_libraryIndex != null && _libraryIndex.AvailableTags != null)
            {
                Log($"ManageTagsDialog: Loading {_libraryIndex.AvailableTags.Count} existing tags");
                foreach (var tag in _libraryIndex.AvailableTags.OrderBy(t => t))
                {
                    Tags.Add(tag);
                }
            }
            else
            {
                Log("ManageTagsDialog: No existing tags found");
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

            // Check if tag already exists (case-insensitive)
            if (Tags.Any(t => string.Equals(t, tagName, System.StringComparison.OrdinalIgnoreCase)))
            {
                Log($"ManageTagsDialog: Tag already exists (case-insensitive): {tagName}");
                return; // Tag already exists
            }

            Log($"ManageTagsDialog: Adding new tag: {tagName}");

            // Add to collection
            Tags.Add(tagName);
            
            // Sort collection
            var sorted = Tags.OrderBy(t => t).ToList();
            Tags.Clear();
            foreach (var tag in sorted)
            {
                Tags.Add(tag);
            }

            // Clear text box
            NewTagTextBox!.Text = "";
        }

        private void DeleteTagButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string tagToDelete)
            {
                Log($"ManageTagsDialog: Deleting tag: {tagToDelete}");
                // Remove from collection
                Tags.Remove(tagToDelete);

                // Remove from all library items (case-insensitive)
                if (_libraryIndex != null)
                {
                    int itemsUpdated = 0;
                    foreach (var item in _libraryIndex.Items)
                    {
                        if (item.Tags != null)
                        {
                            var removed = item.Tags.RemoveAll(t => string.Equals(t, tagToDelete, System.StringComparison.OrdinalIgnoreCase));
                            if (removed > 0)
                            {
                                itemsUpdated++;
                            }
                        }
                    }
                    Log($"ManageTagsDialog: Removed tag from {itemsUpdated} items");
                }
            }
        }

        private void CloseButton_Click(object? sender, RoutedEventArgs e)
        {
            Log($"ManageTagsDialog: Saving {Tags.Count} tags to library");
            
            // Save tags to library index
            if (_libraryIndex != null)
            {
                _libraryIndex.AvailableTags.Clear();
                foreach (var tag in Tags)
                {
                    _libraryIndex.AvailableTags.Add(tag);
                }

                // Save library
                _libraryService?.SaveLibrary();
                Log("ManageTagsDialog: Tags saved successfully");
            }

            Close(true);
        }
    }
}

