using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class ServerLogService
{
    private readonly string _logPath;

    public ServerLogService()
    {
        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(appData);
        _logPath = Path.Combine(appData, "last.log");
    }

    public ServerLogResponse Read(int tail, string? contains, string? level)
    {
        if (!File.Exists(_logPath))
        {
            return new ServerLogResponse
            {
                SourcePath = _logPath,
                TotalLinesRead = 0,
                Lines = []
            };
        }

        var normalizedTail = Math.Clamp(tail <= 0 ? 200 : tail, 1, 5000);
        var needle = string.IsNullOrWhiteSpace(contains) ? null : contains.Trim();
        var normalizedLevel = string.IsNullOrWhiteSpace(level) ? null : level.Trim().ToLowerInvariant();
        var lines = File.ReadLines(_logPath);

        if (!string.IsNullOrWhiteSpace(needle))
        {
            lines = lines.Where(line => line.Contains(needle, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(normalizedLevel))
        {
            lines = lines.Where(line => line.Contains($"[{normalizedLevel}]", StringComparison.OrdinalIgnoreCase));
        }

        var selected = lines.TakeLast(normalizedTail).ToList();
        return new ServerLogResponse
        {
            SourcePath = _logPath,
            TotalLinesRead = selected.Count,
            Lines = selected
        };
    }
}
