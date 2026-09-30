using Avalonia.Controls;
using Avalonia.Interactivity;
using ReelRoulette.LibraryArchive;

namespace ReelRoulette;

public partial class LibraryOverwriteConfirmDialog : Window
{
    public LibraryOverwriteConfirmDialog()
    {
        InitializeComponent();
        ConfirmationTextBlock.Text = LibraryArchiveMigration.OverwriteConfirmationMessage;
    }

    private void ReplaceButton_Click(object? sender, RoutedEventArgs e)
    {
        Close(true);
    }

    private void CancelButton_Click(object? sender, RoutedEventArgs e)
    {
        Close(false);
    }
}
