using Avalonia.Controls;
using Avalonia.Interactivity;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace ReelRoulette
{
    public partial class EditTagDialog : Window
    {
        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        private List<TagCategory> _categories;
        private const string CreateNewCategoryOption = "+ Create New Category...";

        public string? TagName { get; private set; }
        public string? CategoryId { get; private set; }
        public string? CategoryName { get; private set; }
        public bool WasOk { get; private set; }

        public EditTagDialog()
        {
            InitializeComponent();
            _categories = new List<TagCategory>();
            Log("EditTagDialog: Constructor called");
        }

        /// <summary>
        /// Initialize the dialog with existing categories and optionally a tag to edit.
        /// </summary>
        public void Initialize(List<TagCategory> categories, string? existingTagName = null, string? existingCategoryId = null)
        {
            Log($"EditTagDialog.Initialize: categories={categories.Count}, existingTagName={existingTagName ?? "null"}, existingCategoryId={existingCategoryId ?? "null"}");
            
            _categories = categories;

            // Populate category combo box
            CategoryComboBox.Items.Clear();
            
            foreach (var category in categories.OrderBy(c => c.SortOrder))
            {
                CategoryComboBox.Items.Add(new ComboBoxItem 
                { 
                    Content = category.Name,
                    Tag = category.Id
                });
            }

            // Add "Create New Category" option
            CategoryComboBox.Items.Add(new ComboBoxItem 
            { 
                Content = CreateNewCategoryOption,
                Tag = null
            });

            // Set existing values if editing
            if (!string.IsNullOrEmpty(existingTagName))
            {
                TagNameTextBox.Text = existingTagName;
                Title = "Edit Tag";
            }
            else
            {
                Title = "Add Tag";
            }

            if (!string.IsNullOrEmpty(existingCategoryId))
            {
                // Select the category
                for (int i = 0; i < CategoryComboBox.Items.Count; i++)
                {
                    var item = CategoryComboBox.Items[i] as ComboBoxItem;
                    if (item?.Tag as string == existingCategoryId)
                    {
                        CategoryComboBox.SelectedIndex = i;
                        break;
                    }
                }
            }
        }

        private void CategoryComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            var selectedItem = CategoryComboBox.SelectedItem as ComboBoxItem;
            var content = selectedItem?.Content as string;
            
            // Show/hide new category input based on selection
            NewCategoryPanel.IsVisible = content == CreateNewCategoryOption;
            
            Log($"EditTagDialog.CategoryComboBox_SelectionChanged: Selected={content ?? "null"}, NewCategoryPanel.IsVisible={NewCategoryPanel.IsVisible}");
        }

        private void OkButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("EditTagDialog.OkButton_Click: Validating input...");
            
            // Validate tag name
            TagName = TagNameTextBox.Text?.Trim();
            if (string.IsNullOrEmpty(TagName))
            {
                Log("EditTagDialog.OkButton_Click: Tag name is empty, showing error");
                ShowError("Tag name is required.");
                return;
            }

            // Validate category selection
            var selectedItem = CategoryComboBox.SelectedItem as ComboBoxItem;
            if (selectedItem == null)
            {
                Log("EditTagDialog.OkButton_Click: No category selected, showing error");
                ShowError("Please select a category.");
                return;
            }

            var content = selectedItem.Content as string;
            if (content == CreateNewCategoryOption)
            {
                // Creating new category
                CategoryName = NewCategoryNameTextBox.Text?.Trim();
                if (string.IsNullOrEmpty(CategoryName))
                {
                    Log("EditTagDialog.OkButton_Click: New category name is empty, showing error");
                    ShowError("New category name is required.");
                    return;
                }

                // Generate new category ID
                CategoryId = Guid.NewGuid().ToString();
                Log($"EditTagDialog.OkButton_Click: Creating new category '{CategoryName}' with ID {CategoryId}");
            }
            else
            {
                // Using existing category
                CategoryId = selectedItem.Tag as string;
                CategoryName = content;
                Log($"EditTagDialog.OkButton_Click: Using existing category '{CategoryName}' (ID: {CategoryId})");
            }

            WasOk = true;
            Log($"EditTagDialog.OkButton_Click: OK - TagName='{TagName}', CategoryId={CategoryId}, CategoryName='{CategoryName}'");
            Close();
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("EditTagDialog.CancelButton_Click: Cancelled");
            WasOk = false;
            Close();
        }

        private async void ShowError(string message)
        {
            var dialog = new Window
            {
                Title = "Error",
                Width = 300,
                Height = 150,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                Content = new StackPanel
                {
                    Margin = new Avalonia.Thickness(16),
                    Spacing = 12,
                    Children =
                    {
                        new TextBlock { Text = message, TextWrapping = Avalonia.Media.TextWrapping.Wrap },
                        new Button { Content = "OK", HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center }
                    }
                }
            };

            if (dialog.Content is StackPanel panel && panel.Children[1] is Button okButton)
            {
                okButton.Click += (_, _) => dialog.Close();
            }

            await dialog.ShowDialog(this);
        }
    }
}
