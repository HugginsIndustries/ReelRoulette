namespace ReelRoulette.Server.Services;

/// <summary>
/// Lets one stage progress update through per interval. The first update always goes through.
/// Safe to call from the parallel scan tasks of one stage.
/// </summary>
internal sealed class RefreshProgressThrottle
{
    private readonly object _lock = new();
    private readonly TimeSpan _interval;
    private readonly Func<DateTimeOffset> _now;
    private DateTimeOffset _nextUtc = DateTimeOffset.MinValue;

    public RefreshProgressThrottle(TimeSpan interval, Func<DateTimeOffset> now)
    {
        _interval = interval;
        _now = now;
    }

    public bool TryEnter()
    {
        lock (_lock)
        {
            var now = _now();
            if (now < _nextUtc)
            {
                return false;
            }

            _nextUtc = now + _interval;
            return true;
        }
    }
}
