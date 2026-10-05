using System.Text;
using Avalonia.Logging;
using ReelRoulette.Server.Services;

namespace ReelRoulette.ServerApp.Hosting;

/// <summary>
/// Writes Avalonia's warnings and errors from the tray to <c>last.log</c>. Each one is written once per run, keyed by
/// its area and unformatted message, so a warning that new controls raise again (every tray menu opening builds new
/// ones) is not written again.
/// </summary>
internal sealed class AvaloniaLastLogSink(ServerLogService serverLog) : ILogSink
{
    private readonly HashSet<(string Area, string MessageTemplate)> _written = [];

    public bool IsEnabled(LogEventLevel level, string area) => level >= LogEventLevel.Warning;

    public void Log(LogEventLevel level, string area, object? source, string messageTemplate)
    {
        Log(level, area, source, messageTemplate, []);
    }

    public void Log(LogEventLevel level, string area, object? source, string messageTemplate, params object?[] propertyValues)
    {
        if (!IsEnabled(level, area))
        {
            return;
        }

        lock (_written)
        {
            if (!_written.Add((area, messageTemplate)))
            {
                return;
            }
        }

        var sourceName = source is null ? "" : $" ({source.GetType().Name})";
        serverLog.Append(
            level >= LogEventLevel.Error ? "error" : "warn",
            $"Tray UI (Avalonia) [{area}]: {FillTemplate(messageTemplate, propertyValues)}{sourceName}.");
    }

    // Replaces each {Placeholder} with the next value, quoted, the way Avalonia's own text log sinks do.
    private static string FillTemplate(string messageTemplate, object?[] values)
    {
        var result = new StringBuilder(messageTemplate.Length);
        var next = 0;
        for (var i = 0; i < messageTemplate.Length; i++)
        {
            var close = messageTemplate[i] == '{' ? messageTemplate.IndexOf('}', i) : -1;
            if (close < 0)
            {
                result.Append(messageTemplate[i]);
                continue;
            }

            result.Append('\'').Append(next < values.Length ? values[next++] : null).Append('\'');
            i = close;
        }

        return result.ToString();
    }
}
