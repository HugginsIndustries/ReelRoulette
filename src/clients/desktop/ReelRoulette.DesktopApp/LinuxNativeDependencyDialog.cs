using Avalonia;
using Avalonia.Controls;
using Avalonia.Input.Platform;
using Avalonia.Layout;
using Avalonia.Media;

namespace ReelRoulette;

internal static class LinuxNativeDependencyDialog
{
    public static Window CreateMainWindow(LinuxNativeDependencyInstructions.Instructions instructions)
    {
        var window = new Window
        {
            Title = "ReelRoulette — Missing dependencies",
            Width = 680,
            Height = instructions.HasInstallCommand ? 420 : 320,
            MinWidth = 480,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
        };

        var root = new StackPanel
        {
            Margin = new Thickness(20),
            Spacing = 12,
        };

        root.Children.Add(new TextBlock
        {
            Text = instructions.Message,
            TextWrapping = TextWrapping.Wrap,
        });

        if (instructions.HasInstallCommand && !string.IsNullOrWhiteSpace(instructions.DistroHeading))
        {
            root.Children.Add(new TextBlock
            {
                Text = instructions.DistroHeading,
                FontWeight = FontWeight.SemiBold,
                TextWrapping = TextWrapping.Wrap,
            });
        }

        if (instructions.HasInstallCommand && !string.IsNullOrWhiteSpace(instructions.CopyCommand))
        {
            var commandBox = new TextBox
            {
                Text = instructions.CopyCommand,
                IsReadOnly = true,
                AcceptsReturn = true,
                TextWrapping = TextWrapping.Wrap,
                MinHeight = 100,
                FontFamily = new FontFamily("monospace"),
            };

            root.Children.Add(commandBox);

            var copyButton = new Button
            {
                Content = "Copy command",
                HorizontalAlignment = HorizontalAlignment.Left,
                MinWidth = 140,
            };

            copyButton.Click += async (_, _) =>
            {
                var clipboard = TopLevel.GetTopLevel(window)?.Clipboard;
                if (clipboard != null)
                {
                    await clipboard.SetTextAsync(instructions.CopyCommand);
                }
            };

            root.Children.Add(copyButton);
        }

        var closeButton = new Button
        {
            Content = "Close",
            HorizontalAlignment = HorizontalAlignment.Center,
            MinWidth = 100,
            Margin = new Thickness(0, 8, 0, 0),
        };
        closeButton.Click += (_, _) => window.Close();
        root.Children.Add(closeButton);

        window.Content = root;
        return window;
    }
}
