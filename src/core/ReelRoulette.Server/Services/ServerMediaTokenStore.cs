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

    public bool TryResolve(string token, out string fullPath)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            fullPath = string.Empty;
            return false;
        }

        return _tokenToPath.TryGetValue(token, out fullPath!);
    }
}
