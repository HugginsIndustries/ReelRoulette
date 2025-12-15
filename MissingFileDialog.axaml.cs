using Avalonia.Controls;
using Avalonia.Interactivity;
using System.IO;

namespace ReelRoulette
{
    public enum MissingFileDialogResult
    {
        Cancel,
        RemoveFromLibrary,
        LocateFile
    }

    public partial class MissingFileDialog : Window
    {
        public MissingFileDialog(string filePath)
        {
            InitializeComponent();
            
            // Display file information
            var fileName = !string.IsNullOrEmpty(filePath) ? Path.GetFileName(filePath) : "Unknown file";
            FileNameTextBlock.Text = fileName;
            FilePathTextBlock.Text = filePath ?? "Unknown path";
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Close(MissingFileDialogResult.Cancel);
        }

        private void RemoveButton_Click(object? sender, RoutedEventArgs e)
        {
            Close(MissingFileDialogResult.RemoveFromLibrary);
        }

        private void LocateButton_Click(object? sender, RoutedEventArgs e)
        {
            Close(MissingFileDialogResult.LocateFile);
        }
    }
}
