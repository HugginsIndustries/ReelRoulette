using System.Text.Json;

namespace ReelRoulette.WebHost;

public sealed class ActiveVersionResolver
{
    private readonly WebDeploymentOptions _options;
    private readonly ILogger<ActiveVersionResolver> _logger;
    private readonly object _lock = new();
    private ActiveManifest? _cachedManifest;
    private DateTime _cachedWriteUtc = DateTime.MinValue;

    public ActiveVersionResolver(WebDeploymentOptions options, ILogger<ActiveVersionResolver> logger)
    {
        _options = options;
        _logger = logger;
    }

    public ActiveManifest GetActiveManifest()
    {
        lock (_lock)
        {
            if (!File.Exists(_options.ActiveManifestPath))
            {
                throw new InvalidOperationException(
                    $"Active manifest not found at '{_options.ActiveManifestPath}'. Publish and activate a web version first.");
            }

            var writeUtc = File.GetLastWriteTimeUtc(_options.ActiveManifestPath);
            if (_cachedManifest is not null && writeUtc == _cachedWriteUtc)
            {
                return _cachedManifest;
            }

            var json = File.ReadAllText(_options.ActiveManifestPath);
            var manifest = JsonSerializer.Deserialize<ActiveManifest>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            if (manifest is null || string.IsNullOrWhiteSpace(manifest.ActiveVersion))
            {
                throw new InvalidOperationException($"Invalid active manifest in '{_options.ActiveManifestPath}'.");
            }

            _cachedManifest = manifest;
            _cachedWriteUtc = writeUtc;
            _logger.LogInformation(
                "Web deployment active version changed to {ActiveVersion} (previous: {PreviousVersion}).",
                manifest.ActiveVersion,
                manifest.PreviousVersion ?? "(none)");
            return manifest;
        }
    }

    public bool TryResolveFilePath(string activeVersion, string relativePath, out string absolutePath)
    {
        var normalized = relativePath.Replace('/', Path.DirectorySeparatorChar);
        var versionRoot = Path.GetFullPath(Path.Combine(_options.DeployRootPath, "versions", activeVersion));
        absolutePath = Path.GetFullPath(Path.Combine(versionRoot, normalized));
        if (!absolutePath.StartsWith(versionRoot, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return true;
    }
}
