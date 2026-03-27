using Avalonia.Controls;
using Avalonia.Interactivity;

namespace ReelRoulette
{
    public partial class RemoveItemsDialog : Window
    {
        public RemoveItemsDialog(int count)
        {
            InitializeComponent();
            
            MessageTextBlock.Text = $"Are you sure you want to remove {count} item(s) from the library?";
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            Close(false);
        }

        private void RemoveButton_Click(object? sender, RoutedEventArgs e)
        {
            Close(true);
        }
    }
}
