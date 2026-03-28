using System;
using System.Collections.Generic;
using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Platform.Storage;

namespace ReelRoulette;

public partial class LibraryImportRemapDialog : Window
{
    private sealed class Row
    {
        public required string ExportedPath { get; init; }
        public required TextBlock PickedPathText { get; init; }
        public required CheckBox SkipCheck { get; init; }
        public string? PickedPath { get; set; }
    }

    private readonly List<Row> _rows = [];

    private static readonly JsonSerializerOptions PlanJsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public LibraryImportRemapDialog(IReadOnlyList<string> sourceRootPaths)
    {
        InitializeComponent();

        foreach (var path in sourceRootPaths)
        {
            var pickedText = new TextBlock
            {
                Text = "(choose folder)",
                TextWrapping = TextWrapping.Wrap,
                Foreground = Brushes.Gray,
                VerticalAlignment = VerticalAlignment.Center
            };
            var skip = new CheckBox
            {
                Content = "Skip",
                VerticalAlignment = VerticalAlignment.Center
            };
            var browse = new Button
            {
                Content = "Browse…",
                MinWidth = 88,
                VerticalAlignment = VerticalAlignment.Center
            };

            var rowState = new Row
            {
                ExportedPath = path,
                PickedPathText = pickedText,
                SkipCheck = skip
            };

            browse.Click += async (_, _) =>
            {
                if (skip.IsChecked == true)
                {
                    return;
                }

                var options = new FolderPickerOpenOptions { Title = "Select folder for: " + path };
                var result = await StorageProvider.OpenFolderPickerAsync(options);
                if (result.Count == 0 || result[0] == null)
                {
                    return;
                }

                rowState.PickedPath = result[0].Path.LocalPath;
                pickedText.Text = rowState.PickedPath;
                pickedText.Foreground = null;
            };

            skip.IsCheckedChanged += (_, _) =>
            {
                var on = skip.IsChecked == true;
                browse.IsEnabled = !on;
                if (on)
                {
                    rowState.PickedPath = null;
                    pickedText.Text = "(skipped)";
                    pickedText.Foreground = Brushes.Gray;
                }
                else
                {
                    pickedText.Text = rowState.PickedPath ?? "(choose folder)";
                    pickedText.Foreground = rowState.PickedPath != null ? null : Brushes.Gray;
                }
            };

            _rows.Add(rowState);

            var header = new TextBlock
            {
                Text = path,
                TextWrapping = TextWrapping.Wrap,
                FontWeight = FontWeight.SemiBold
            };

            var inner = new Grid();
            inner.RowDefinitions.Add(new RowDefinition(GridLength.Auto));
            inner.RowDefinitions.Add(new RowDefinition(GridLength.Auto));
            inner.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
            inner.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));
            inner.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));

            Grid.SetRow(header, 0);
            Grid.SetColumnSpan(header, 3);
            inner.Children.Add(header);

            Grid.SetRow(pickedText, 1);
            Grid.SetColumn(pickedText, 0);
            inner.Children.Add(pickedText);

            Grid.SetRow(browse, 1);
            Grid.SetColumn(browse, 1);
            inner.Children.Add(browse);

            Grid.SetRow(skip, 1);
            Grid.SetColumn(skip, 2);
            inner.Children.Add(skip);

            var border = new Border
            {
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(10),
                Child = inner
            };
            RowsPanel.Children.Add(border);
        }
    }

    public string? PlanJson { get; private set; }

    private async void ConfirmButton_Click(object? sender, RoutedEventArgs e)
    {
        var remap = new Dictionary<string, string>(StringComparer.Ordinal);
        var skipped = new List<string>();

        foreach (var row in _rows)
        {
            if (row.SkipCheck.IsChecked == true)
            {
                skipped.Add(row.ExportedPath);
                continue;
            }

            if (string.IsNullOrWhiteSpace(row.PickedPath))
            {
                var err = new Window
                {
                    Title = "Import Library",
                    Width = 440,
                    Height = 160,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner,
                    Content = new TextBlock
                    {
                        Text = "Choose a folder or enable Skip for:\n" + row.ExportedPath,
                        Margin = new Thickness(16),
                        TextWrapping = TextWrapping.Wrap
                    }
                };
                await err.ShowDialog(this).ConfigureAwait(true);
                return;
            }

            remap[row.ExportedPath] = row.PickedPath.Trim();
        }

        var plan = new LibraryImportPlanPayload
        {
            Remap = remap,
            SkippedRoots = skipped
        };
        PlanJson = JsonSerializer.Serialize(plan, PlanJsonOptions);
        Close(true);
    }

    private void CancelButton_Click(object? sender, RoutedEventArgs e)
    {
        Close(false);
    }

    private sealed class LibraryImportPlanPayload
    {
        public Dictionary<string, string> Remap { get; set; } = new(StringComparer.Ordinal);
        public List<string> SkippedRoots { get; set; } = [];
    }
}
