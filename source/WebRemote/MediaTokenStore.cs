using System;
using System.Collections.Generic;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// Short-lived token store for media URLs. Maps token -> FullPath.
    /// Tokens expire after a configurable duration.
    /// </summary>
    public class MediaTokenStore
    {
        private readonly Dictionary<string, (string FullPath, DateTime ExpiresAt)> _tokens = new();
        private readonly TimeSpan _defaultTtl = TimeSpan.FromHours(1);
        private readonly object _lock = new object();

        /// <summary>
        /// Creates a token for the given path and returns it.
        /// </summary>
        public string CreateToken(string fullPath, TimeSpan? ttl = null)
        {
            var token = Guid.NewGuid().ToString("N");
            var expires = DateTime.UtcNow + (ttl ?? _defaultTtl);
            lock (_lock)
            {
                EvictExpired();
                _tokens[token] = (fullPath, expires);
            }
            return token;
        }

        /// <summary>
        /// Tries to resolve a token to a full path. Returns null if not found or expired.
        /// </summary>
        public string? TryResolve(string token)
        {
            lock (_lock)
            {
                if (!_tokens.TryGetValue(token, out var entry))
                    return null;
                if (DateTime.UtcNow > entry.ExpiresAt)
                {
                    _tokens.Remove(token);
                    return null;
                }
                return entry.FullPath;
            }
        }

        private void EvictExpired()
        {
            var now = DateTime.UtcNow;
            var toRemove = new List<string>();
            foreach (var kv in _tokens)
            {
                if (now > kv.Value.ExpiresAt)
                    toRemove.Add(kv.Key);
            }
            foreach (var k in toRemove)
                _tokens.Remove(k);
        }
    }
}
