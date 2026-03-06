using System.Collections.Concurrent;

namespace ReelRoulette.Server.Services;

public sealed class ServerMediaTokenStore
{
    private readonly ConcurrentDictionary<string, string> _tokenToPath = new(StringComparer.Ordinal);

    public string CreateToken(string fullPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fullPath);

        var token = Guid.NewGuid().ToString("N");
        _tokenToPath[token] = fullPath;
        return token;
    }

    public bool TryResolve(string tokenOrId, out string fullPath)
    {
        if (string.IsNullOrWhiteSpace(tokenOrId))
        {
            fullPath = string.Empty;
            return false;
        }

        return _tokenToPath.TryGetValue(tokenOrId, out fullPath!);
    }
}
