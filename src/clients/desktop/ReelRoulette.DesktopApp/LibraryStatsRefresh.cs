using System;
using System.Threading.Tasks;

namespace ReelRoulette;

/// <summary>
/// Coalesces library stats refreshes. A request waits a short delay so a burst of events shares one fetch.
/// At most one fetch is in flight. Requests that arrive during a fetch get exactly one more fetch after it.
/// The task a request returns completes once a fetch that started after that request has been applied.
/// </summary>
public sealed class LibraryStatsRefresh
{
    public static readonly TimeSpan GatherDelay = TimeSpan.FromMilliseconds(250);

    private readonly object _lock = new();
    private readonly Func<Task<CoreLibraryStatsResponse?>> _fetch;
    private readonly Func<CoreLibraryStatsResponse?, Task> _apply;
    private readonly Func<Task> _gather;
    private readonly Action<string>? _log;
    private TaskCompletionSource? _next;
    private int _nextRequestCount;
    private bool _running;

    public LibraryStatsRefresh(
        Func<Task<CoreLibraryStatsResponse?>> fetch,
        Func<CoreLibraryStatsResponse?, Task> apply,
        Func<Task>? gather = null,
        Action<string>? log = null)
    {
        _fetch = fetch;
        _apply = apply;
        _gather = gather ?? (() => Task.Delay(GatherDelay));
        _log = log;
    }

    public Task RequestAsync()
    {
        lock (_lock)
        {
            _next ??= new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            _nextRequestCount++;
            var waiter = _next.Task;
            if (!_running)
            {
                _running = true;
                _ = RunAsync();
            }

            return waiter;
        }
    }

    private async Task RunAsync()
    {
        while (true)
        {
            try
            {
                await _gather();
            }
            catch (Exception ex)
            {
                _log?.Invoke($"LibraryStats: Gather delay failed ({ex.Message}).");
            }

            TaskCompletionSource covered;
            int requestCount;
            lock (_lock)
            {
                covered = _next!;
                requestCount = _nextRequestCount;
                _next = null;
                _nextRequestCount = 0;
            }

            _log?.Invoke($"LibraryStats: Fetching stats for {requestCount} refresh request(s).");
            try
            {
                var stats = await _fetch();
                await _apply(stats);
            }
            catch (Exception ex)
            {
                _log?.Invoke($"LibraryStats: Refresh failed ({ex.Message}).");
            }
            finally
            {
                covered.TrySetResult();
            }

            lock (_lock)
            {
                if (_next == null)
                {
                    _running = false;
                    return;
                }
            }
        }
    }
}
