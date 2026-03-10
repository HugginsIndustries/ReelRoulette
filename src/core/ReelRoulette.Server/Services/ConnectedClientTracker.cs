using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class ConnectedClientTracker
{
    private readonly object _lock = new();
    private readonly Dictionary<string, SseClientInfoSnapshot> _sseClients = new(StringComparer.Ordinal);

    public string RegisterSseClient(
        string? clientId,
        string? sessionId,
        string? clientType,
        string? deviceName,
        string? userAgent,
        string? remoteAddress)
    {
        var connectionId = Guid.NewGuid().ToString("N");
        var snapshot = new SseClientInfoSnapshot
        {
            ConnectionId = connectionId,
            ClientId = string.IsNullOrWhiteSpace(clientId) ? null : clientId.Trim(),
            SessionId = string.IsNullOrWhiteSpace(sessionId) ? null : sessionId.Trim(),
            ClientType = NormalizeClientType(clientType, userAgent),
            DeviceName = NormalizeText(deviceName),
            UserAgent = NormalizeText(userAgent, maxLength: 256),
            ConnectedUtc = DateTimeOffset.UtcNow,
            RemoteAddress = NormalizeText(remoteAddress)
        };

        lock (_lock)
        {
            _sseClients[connectionId] = snapshot;
        }

        return connectionId;
    }

    public void UnregisterSseClient(string? connectionId)
    {
        if (string.IsNullOrWhiteSpace(connectionId))
        {
            return;
        }

        lock (_lock)
        {
            _sseClients.Remove(connectionId);
        }
    }

    public IReadOnlyList<SseClientInfoSnapshot> GetActiveSseClients()
    {
        lock (_lock)
        {
            return _sseClients.Values
                .OrderByDescending(client => client.ConnectedUtc)
                .ToList();
        }
    }

    private static string? NormalizeText(string? value, int maxLength = 128)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static string NormalizeClientType(string? requestedType, string? userAgent)
    {
        var normalized = NormalizeText(requestedType, maxLength: 32)?.ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            return normalized!;
        }

        var ua = userAgent ?? string.Empty;
        if (ua.Contains("Android", StringComparison.OrdinalIgnoreCase) ||
            ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) ||
            ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) ||
            ua.Contains("Mobi", StringComparison.OrdinalIgnoreCase))
        {
            return "mobile-web";
        }

        return "unknown";
    }
}
