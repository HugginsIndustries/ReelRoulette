namespace ReelRoulette.Server.Auth;

public sealed class ServerSessionStore
{
    public const string ApiScope = "api";
    public const string ControlScope = "control";

    private readonly object _lock = new();
    private readonly Dictionary<string, SessionRecord> _sessions = new(StringComparer.Ordinal);

    public string CreateSession(DateTimeOffset nowUtc, TimeSpan duration)
        => CreateSession(ApiScope, nowUtc, duration);

    public string CreateSession(string scope, DateTimeOffset nowUtc, TimeSpan duration)
    {
        var sessionId = Guid.NewGuid().ToString("N");
        var normalizedScope = NormalizeScope(scope);
        lock (_lock)
        {
            PruneExpiredLocked(nowUtc);
            _sessions[sessionId] = new SessionRecord
            {
                Scope = normalizedScope,
                ExpiresUtc = nowUtc.Add(duration)
            };
        }

        return sessionId;
    }

    public bool IsSessionValid(string? sessionId, DateTimeOffset nowUtc)
        => IsSessionValid(ApiScope, sessionId, nowUtc);

    public bool IsSessionValid(string scope, string? sessionId, DateTimeOffset nowUtc)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        var normalizedScope = NormalizeScope(scope);
        lock (_lock)
        {
            PruneExpiredLocked(nowUtc);
            if (!_sessions.TryGetValue(sessionId, out var record))
            {
                return false;
            }

            return string.Equals(record.Scope, normalizedScope, StringComparison.Ordinal);
        }
    }

    public int GetActiveSessionCount(string scope, DateTimeOffset nowUtc)
    {
        var normalizedScope = NormalizeScope(scope);
        lock (_lock)
        {
            PruneExpiredLocked(nowUtc);
            return _sessions.Values.Count(session => string.Equals(session.Scope, normalizedScope, StringComparison.Ordinal));
        }
    }

    private void PruneExpiredLocked(DateTimeOffset nowUtc)
    {
        if (_sessions.Count == 0)
        {
            return;
        }

        var expired = _sessions
            .Where(kvp => kvp.Value.ExpiresUtc <= nowUtc)
            .Select(kvp => kvp.Key)
            .ToList();
        foreach (var sessionId in expired)
        {
            _sessions.Remove(sessionId);
        }
    }

    private static string NormalizeScope(string? scope)
    {
        if (string.Equals(scope, ControlScope, StringComparison.OrdinalIgnoreCase))
        {
            return ControlScope;
        }

        return ApiScope;
    }

    private sealed class SessionRecord
    {
        public string Scope { get; set; } = ApiScope;
        public DateTimeOffset ExpiresUtc { get; set; }
    }
}
