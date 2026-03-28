using Avalonia.Controls;
using Avalonia.Interactivity;

namespace ReelRoulette;

public partial class LibraryExportOptionsDialog : Window
{
    public LibraryExportOptionsDialog()
    {
        InitializeComponent();
    }

    public bool IncludeThumbnails { get; private set; }
    public bool IncludeBackups { get; private set; }

    private void OkButton_Click(object? sender, RoutedEventArgs e)
    {
        IncludeThumbnails = IncludeThumbnailsCheckBox.IsChecked == true;
        IncludeBackups = IncludeBackupsCheckBox.IsChecked == true;
        Close(true);
    }

    private void CancelButton_Click(object? sender, RoutedEventArgs e)
    {
        Close(false);
    }
}
