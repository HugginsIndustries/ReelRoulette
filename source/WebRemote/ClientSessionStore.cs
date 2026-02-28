using System;
using System.Collections.Generic;
using System.Linq;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// In-memory per-client session store for history (Previous) and repeat avoidance.
    /// Keyed by clientId. Holds a ring buffer of recently played item paths.
    /// </summary>
    public class ClientSessionStore
    {
        private readonly Dictionary<string, LinkedList<string>> _history = new();
        private readonly int _maxHistory = 50;
        private readonly object _lock = new object();

        /// <summary>
        /// Pushes an item path to the client's history.
        /// </summary>
        public void Push(string clientId, string fullPath)
        {
            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(fullPath))
                return;
            lock (_lock)
            {
                if (!_history.TryGetValue(clientId, out var list))
                {
                    list = new LinkedList<string>();
                    _history[clientId] = list;
                }
                list.AddLast(fullPath);
                while (list.Count > _maxHistory)
                    list.RemoveFirst();
            }
        }

        /// <summary>
        /// Pops the most recent item from history (for Previous). Returns null if empty.
        /// </summary>
        public string? Pop(string clientId)
        {
            if (string.IsNullOrEmpty(clientId))
                return null;
            lock (_lock)
            {
                if (!_history.TryGetValue(clientId, out var list) || list.Count == 0)
                    return null;
                var last = list.Last!.Value;
                list.RemoveLast();
                return last;
            }
        }

        /// <summary>
        /// Peeks the previous item without removing it. Returns null if empty.
        /// </summary>
        public string? PeekPrevious(string clientId)
        {
            if (string.IsNullOrEmpty(clientId))
                return null;
            lock (_lock)
            {
                if (!_history.TryGetValue(clientId, out var list) || list.Count < 2)
                    return null;
                return list.Last!.Previous?.Value;
            }
        }

        /// <summary>
        /// Gets the count of items in history for this client.
        /// </summary>
        public int GetHistoryCount(string clientId)
        {
            if (string.IsNullOrEmpty(clientId))
                return 0;
            lock (_lock)
            {
                return _history.TryGetValue(clientId, out var list) ? list.Count : 0;
            }
        }

        /// <summary>
        /// Excludes recently played paths from the given set for repeat avoidance.
        /// Returns the filtered set. If all are excluded, returns original (allow repeat).
        /// </summary>
        public IEnumerable<string> ExcludeRecent(string clientId, IEnumerable<string> paths, int excludeCount = 5)
        {
            if (string.IsNullOrEmpty(clientId))
                return paths;
            lock (_lock)
            {
                if (!_history.TryGetValue(clientId, out var list) || list.Count == 0)
                    return paths;
                var recent = new HashSet<string>(list.TakeLast(excludeCount), StringComparer.OrdinalIgnoreCase);
                var filtered = paths.Where(p => !recent.Contains(p)).ToList();
                return filtered.Count > 0 ? filtered : paths;
            }
        }
    }
}
