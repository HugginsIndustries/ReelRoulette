using System;

namespace ReelRoulette;

public static class CoreEventRevision
{
    /// <summary>
    /// The revision to resume from. A resync takes its own revision, which can be lower after a server restart.
    /// <c>streamOpened</c> gives a client with no revision the server's revision, even 0, and never moves one it holds.
    /// Locked to shared/fixtures/event-revision.json.
    /// </summary>
    public static long Next(long? lastRevision, string? eventType, long revision)
    {
        if (string.Equals(eventType, "resyncRequired", StringComparison.Ordinal) || lastRevision is not long last)
        {
            return revision;
        }

        if (string.Equals(eventType, "streamOpened", StringComparison.Ordinal))
        {
            return last;
        }

        return Math.Max(last, revision);
    }
}
