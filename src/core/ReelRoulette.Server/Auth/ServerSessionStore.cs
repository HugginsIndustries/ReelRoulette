namespace ReelRoulette.Server.Auth;

public sealed class ServerSessionStore
{
    private readonly object _lock = new();
    private readonly Dictionary<string, DateTimeOffset> _sessions = new(StringComparer.Ordinal);

    public string CreateSession(DateTimeOffset nowUtc, TimeSpan duration)
    {
        var sessionId = Guid.NewGuid().ToString("N");
        lock (_lock)
        {
            PruneExpiredLocked(nowUtc);
            _sessions[sessionId] = nowUtc.Add(duration);
        }

        return sessionId;
    }

    public bool IsSessionValid(string? sessionId, DateTimeOffset nowUtc)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        lock (_lock)
        {
            PruneExpiredLocked(nowUtc);
            return _sessions.ContainsKey(sessionId);
        }
    }

    private void PruneExpiredLocked(DateTimeOffset nowUtc)
    {
        if (_sessions.Count == 0)
        {
            return;
        }

        var expired = _sessions
            .Where(kvp => kvp.Value <= nowUtc)
            .Select(kvp => kvp.Key)
            .ToList();
        foreach (var sessionId in expired)
        {
            _sessions.Remove(sessionId);
        }
    }
}
