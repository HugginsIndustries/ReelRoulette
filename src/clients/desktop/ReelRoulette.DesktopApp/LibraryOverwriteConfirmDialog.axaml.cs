using Avalonia.Controls;
using Avalonia.Interactivity;

namespace ReelRoulette;

public partial class LibraryOverwriteConfirmDialog : Window
{
    public LibraryOverwriteConfirmDialog()
    {
        InitializeComponent();
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
