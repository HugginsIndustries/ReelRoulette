using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class ServerLogService
{
    private readonly string _logPath;
    private readonly ILogger? _logger;

    public ServerLogService()
        : this(ServerDataPaths.DataDirectory())
    {
    }

    public ServerLogService(string appDataDirectory, ILogger? logger = null)
    {
        Directory.CreateDirectory(appDataDirectory);
        _logPath = Path.Combine(appDataDirectory, "last.log");
        _logger = logger;
    }

    public void Append(string level, string message)
    {
        try
        {
            File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [server] [{level}] {message}{Environment.NewLine}");
        }
        catch (Exception ex)
        {
            // Logging must not fail the request that wrote it.
            _logger?.LogWarning(ex, "Failed to append to last.log.");
        }
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
