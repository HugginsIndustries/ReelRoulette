using System.Text.RegularExpressions;

namespace ReelRoulette.WebHost;

public static class CachePolicyResolver
{
    private static readonly Regex FingerprintedAssetPattern = new("-[A-Za-z0-9_-]{8,}\\.", RegexOptions.Compiled);

    public static string Resolve(string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        if (normalized.Equals("index.html", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("runtime-config.json", StringComparison.OrdinalIgnoreCase))
        {
            return "no-store";
        }

        if (normalized.StartsWith("assets/", StringComparison.OrdinalIgnoreCase) &&
            FingerprintedAssetPattern.IsMatch(normalized))
        {
            return "public, max-age=31536000, immutable";
        }

        return "no-cache";
    }
}
