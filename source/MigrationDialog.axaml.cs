using Avalonia.Controls;
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
    public class MigrationTagViewModel : INotifyPropertyChanged
    {
        private string _tagName = string.Empty;
        private string? _categoryId;
        private string? _categoryName;

        public string TagName
        {
            get => _tagName;
            set
            {
                _tagName = value;
                OnPropertyChanged();
            }
        }

        public string? CategoryId
        {
            get => _categoryId;
            set
            {
                _categoryId = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsCategorized));
                OnPropertyChanged(nameof(CategoryDisplay));
                OnPropertyChanged(nameof(BackgroundBrush));
            }
        }

        public string? CategoryName
        {
            get => _categoryName;
            set
            {
                _categoryName = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CategoryDisplay));
            }
        }

        public bool IsCategorized => !string.IsNullOrEmpty(CategoryId);

        public string CategoryDisplay => IsCategorized 
            ? $"Category: {CategoryName}" 
            : "No category assigned";

        public IBrush BackgroundBrush => IsCategorized
            ? new SolidColorBrush(Color.FromRgb(45, 45, 48)) // Dark gray when done
            : new SolidColorBrush(Color.FromRgb(60, 35, 35)); // Reddish tint when not done

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public partial class MigrationDialog : Window
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

        private ObservableCollection<MigrationTagViewModel> _tagViewModels;
        private List<TagCategory> _categories;

        public bool WasCompleted { get; private set; }
        public List<TagCategory> Categories => _categories;
        public List<Tag> MigratedTags { get; private set; }

        public MigrationDialog()
        {
            InitializeComponent();
            _tagViewModels = new ObservableCollection<MigrationTagViewModel>();
            _categories = new List<TagCategory>();
            MigratedTags = new List<Tag>();
            Log("MigrationDialog: Constructor called");
        }

        /// <summary>
        /// Initialize the dialog with the list of tags to migrate.
        /// </summary>
        public void Initialize(List<string> flatTags)
        {
            Log($"MigrationDialog.Initialize: {flatTags.Count} tags to migrate");

            _tagViewModels.Clear();
            foreach (var tagName in flatTags.OrderBy(t => t))
            {
                _tagViewModels.Add(new MigrationTagViewModel 
                { 
                    TagName = tagName 
                });
            }

            TagsItemsControl.ItemsSource = _tagViewModels;
            UpdateProgress();
        }

        private void UpdateProgress()
        {
            int total = _tagViewModels.Count;
            int categorized = _tagViewModels.Count(vm => vm.IsCategorized);
            
            ProgressTextBlock.Text = $"{categorized} of {total} tags categorized";
            ContinueButton.IsEnabled = categorized == total && total > 0;
            
            Log($"MigrationDialog.UpdateProgress: {categorized}/{total} tags categorized, Continue enabled: {ContinueButton.IsEnabled}");
        }

        private async void EditButton_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.CommandParameter is MigrationTagViewModel vm)
            {
                Log($"MigrationDialog.EditButton_Click: Editing tag '{vm.TagName}'");

                var dialog = new EditTagDialog();
                dialog.Initialize(_categories, vm.TagName, vm.CategoryId);
                
                await dialog.ShowDialog(this);

                if (dialog.WasOk)
                {
                    Log($"MigrationDialog.EditButton_Click: User confirmed - CategoryId={dialog.CategoryId}, CategoryName={dialog.CategoryName}");

                    // Check if a new category was created
                    if (!string.IsNullOrEmpty(dialog.CategoryId) && 
                        !_categories.Any(c => c.Id == dialog.CategoryId))
                    {
                        // Add new category
                        var newCategory = new TagCategory
                        {
                            Id = dialog.CategoryId,
                            Name = dialog.CategoryName ?? "Unknown",
                            SortOrder = _categories.Count
                        };
                        _categories.Add(newCategory);
                        Log($"MigrationDialog.EditButton_Click: Created new category '{newCategory.Name}' (ID: {newCategory.Id})");
                    }

                    // Update view model
                    vm.CategoryId = dialog.CategoryId;
                    vm.CategoryName = dialog.CategoryName;
                    
                    // Update tag name if changed
                    if (!string.IsNullOrEmpty(dialog.TagName) && dialog.TagName != vm.TagName)
                    {
                        vm.TagName = dialog.TagName;
                        Log($"MigrationDialog.EditButton_Click: Tag name changed to '{dialog.TagName}'");
                    }

                    UpdateProgress();
                }
                else
                {
                    Log("MigrationDialog.EditButton_Click: User cancelled");
                }
            }
        }

        private void ContinueButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("MigrationDialog.ContinueButton_Click: Building migrated tags list");

            // Build the list of migrated tags
            MigratedTags.Clear();
            foreach (var vm in _tagViewModels)
            {
                if (vm.IsCategorized)
                {
                    MigratedTags.Add(new Tag
                    {
                        Name = vm.TagName,
                        CategoryId = vm.CategoryId!
                    });
                }
            }

            Log($"MigrationDialog.ContinueButton_Click: Migration completed - {Categories.Count} categories, {MigratedTags.Count} tags");
            WasCompleted = true;
            Close();
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("MigrationDialog.CancelButton_Click: Migration cancelled by user");
            WasCompleted = false;
            Close();
        }
    }
}
