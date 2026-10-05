using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class ServerLogService
{
    // Every last.log append in the process takes this lock, whichever instance makes it. Without it, appends made at
    // the same moment overwrite each other on Linux and fail to open the file on Windows.
    private static readonly object AppendLock = new();

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
        Append("server", level, message);
    }

    /// <summary>
    /// Appends one line. Line breaks in any part become a literal <c>\n</c>, so a client message cannot add a line.
    /// </summary>
    public void Append(string source, string level, string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{source}] [{level}] {message}".ReplaceLineEndings(@"\n");
        try
        {
            lock (AppendLock)
            {
                File.AppendAllText(_logPath, line + Environment.NewLine);
            }
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
