using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using System;
using System.Linq;
using System.Text;
using System.Threading;
using Avalonia.Threading;

namespace ReelRoulette
{
    public partial class FFmpegLogWindow : Window
    {
        private MainWindow? _mainWindow;
        private DispatcherTimer? _refreshTimer;

        public FFmpegLogWindow()
        {
            InitializeComponent();
            this.Closed += FFmpegLogWindow_Closed;
        }

        public FFmpegLogWindow(MainWindow mainWindow) : this()
        {
            _mainWindow = mainWindow;
            UpdateLogDisplay();
            
            // Set up auto-refresh timer (every 2 seconds)
            _refreshTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(2)
            };
            _refreshTimer.Tick += (s, e) => UpdateLogDisplay();
            _refreshTimer.Start();
        }

        private void FFmpegLogWindow_Closed(object? sender, EventArgs e)
        {
            _refreshTimer?.Stop();
            _refreshTimer = null;
        }

        public void UpdateLogDisplay()
        {
            if (_mainWindow == null)
                return;

            var logs = _mainWindow.GetFFmpegLogs();
            var sb = new StringBuilder();

            foreach (var log in logs)
            {
                sb.AppendLine($"=== {log.Timestamp:yyyy-MM-dd HH:mm:ss.fff} ===");
                sb.AppendLine($"File: {log.FilePath}");
                sb.AppendLine($"Exit Code: {log.ExitCode}");
                sb.AppendLine($"Result: {log.Result}");
                sb.AppendLine($"Output:");
                sb.AppendLine(log.Output);
                sb.AppendLine();
                sb.AppendLine(new string('-', 80));
                sb.AppendLine();
            }

            LogTextBox.Text = sb.ToString();
        }

        private async void CopyLogsButton_Click(object? sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrEmpty(LogTextBox.Text))
            {
                var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
                if (clipboard != null)
                {
                    await clipboard.SetTextAsync(LogTextBox.Text);
                }
            }
        }

        private void ClearLogsButton_Click(object? sender, RoutedEventArgs e)
        {
            _mainWindow?.ClearFFmpegLogs();
            UpdateLogDisplay();
        }

        private void CloseButton_Click(object? sender, RoutedEventArgs e)
        {
            Close();
        }
    }
}
