using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class ApiTelemetryService
{
    private const int MaxEntries = 200;
    private readonly object _lock = new();
    private readonly Queue<ApiEventTelemetryEntry> _incoming = new();
    private readonly Queue<ApiEventTelemetryEntry> _outgoing = new();

    public void RecordIncoming(string method, string path)
    {
        lock (_lock)
        {
            EnqueueWithLimit(_incoming, new ApiEventTelemetryEntry
            {
                TimestampUtc = DateTimeOffset.UtcNow,
                Direction = "incoming",
                Method = method,
                Path = path
            });
        }
    }

    public void RecordOutgoing(string method, string path, int statusCode)
    {
        lock (_lock)
        {
            EnqueueWithLimit(_outgoing, new ApiEventTelemetryEntry
            {
                TimestampUtc = DateTimeOffset.UtcNow,
                Direction = "outgoing",
                Method = method,
                Path = path,
                StatusCode = statusCode
            });
        }
    }

    public void RecordOutgoingServerEvent(string eventType)
    {
        lock (_lock)
        {
            EnqueueWithLimit(_outgoing, new ApiEventTelemetryEntry
            {
                TimestampUtc = DateTimeOffset.UtcNow,
                Direction = "outgoing",
                Method = "SSE",
                Path = "/api/events",
                EventType = eventType
            });
        }
    }

    public List<ApiEventTelemetryEntry> GetIncoming(int max)
    {
        lock (_lock)
        {
            return _incoming
                .Reverse()
                .Take(Math.Max(1, max))
                .ToList();
        }
    }

    public List<ApiEventTelemetryEntry> GetOutgoing(int max)
    {
        lock (_lock)
        {
            return _outgoing
                .Reverse()
                .Take(Math.Max(1, max))
                .ToList();
        }
    }

    private static void EnqueueWithLimit(Queue<ApiEventTelemetryEntry> queue, ApiEventTelemetryEntry entry)
    {
        queue.Enqueue(entry);
        while (queue.Count > MaxEntries)
        {
            queue.Dequeue();
        }
    }
}
