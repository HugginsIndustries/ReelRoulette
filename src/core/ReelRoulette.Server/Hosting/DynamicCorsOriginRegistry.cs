using System.Net;
using System.Net.NetworkInformation;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

public sealed class DynamicCorsOriginRegistry : IDisposable
{
    private readonly object _lock = new();
    private readonly HashSet<string> _baseOrigins;
    private readonly HashSet<string> _allowedOrigins;
    private readonly ServerRuntimeOptions _runtimeOptions;
    private CoreSettingsService? _settings;
    private ILogger? _logger;
    private bool _started;
    private bool _disposed;

    public DynamicCorsOriginRegistry(ServerRuntimeOptions runtimeOptions)
    {
        _runtimeOptions = runtimeOptions;
        _baseOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var origin in runtimeOptions.CorsAllowedOrigins)
        {
            if (TryNormalizeOrigin(origin, out var normalized))
            {
                _baseOrigins.Add(normalized);
            }
        }

        _allowedOrigins = new HashSet<string>(_baseOrigins, StringComparer.OrdinalIgnoreCase);
    }

    public bool IsAllowed(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin))
        {
            return false;
        }

        if (!TryNormalizeOrigin(origin, out var normalized))
        {
            return false;
        }

        lock (_lock)
        {
            return _allowedOrigins.Contains(normalized);
        }
    }

    public void Start(CoreSettingsService settings, ILogger logger)
    {
        lock (_lock)
        {
            if (_started)
            {
                return;
            }

            _settings = settings;
            _logger = logger;
            _settings.WebRuntimeSettingsChanged += OnWebRuntimeSettingsChanged;
            NetworkChange.NetworkAddressChanged += OnNetworkAddressChanged;
            RebuildAllowedOrigins(_settings.GetWebRuntimeSettings(), "startup");
            _started = true;
        }
    }

    public void Stop()
    {
        lock (_lock)
        {
            if (!_started)
            {
                return;
            }

            if (_settings != null)
            {
                _settings.WebRuntimeSettingsChanged -= OnWebRuntimeSettingsChanged;
            }

            NetworkChange.NetworkAddressChanged -= OnNetworkAddressChanged;
            _settings = null;
            _logger = null;
            _started = false;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        Stop();
    }

    private void OnWebRuntimeSettingsChanged(WebRuntimeSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            RebuildAllowedOrigins(snapshot, "web-runtime-updated");
        }
    }

    private void OnNetworkAddressChanged(object? sender, EventArgs eventArgs)
    {
        lock (_lock)
        {
            if (_settings == null)
            {
                return;
            }

            RebuildAllowedOrigins(_settings.GetWebRuntimeSettings(), "network-address-updated");
        }
    }

    private void RebuildAllowedOrigins(WebRuntimeSettingsSnapshot snapshot, string reason)
    {
        _allowedOrigins.Clear();
        foreach (var origin in _baseOrigins)
        {
            _allowedOrigins.Add(origin);
        }

        if (snapshot.Enabled)
        {
            var webPort = snapshot.Port > 0 ? snapshot.Port : 45123;
            _allowedOrigins.Add(BuildOrigin("localhost", webPort));
            _allowedOrigins.Add(BuildOrigin("127.0.0.1", webPort));

            if (snapshot.BindOnLan)
            {
                var hostLabel = NormalizeMdnsHostLabel(snapshot.LanHostname);
                _allowedOrigins.Add(BuildOrigin($"{hostLabel}.local", webPort));
                foreach (var address in GetPrivateLanIpv4Addresses())
                {
                    _allowedOrigins.Add(BuildOrigin(address.ToString(), webPort));
                }
            }
        }

        _runtimeOptions.CorsAllowedOrigins = _allowedOrigins.OrderBy(static x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _logger?.LogInformation(
            "CORS origin registry rebuilt ({Reason}) with {Count} allowed origin(s).",
            reason,
            _allowedOrigins.Count);
    }

    private static IEnumerable<IPAddress> GetPrivateLanIpv4Addresses()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up)
            {
                continue;
            }

            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
            {
                continue;
            }

            var props = nic.GetIPProperties();
            foreach (var unicast in props.UnicastAddresses)
            {
                var ip = unicast.Address;
                if (ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
                {
                    continue;
                }

                if (!IsPrivateLanIpv4(ip))
                {
                    continue;
                }

                var key = ip.ToString();
                if (seen.Add(key))
                {
                    yield return ip;
                }
            }
        }
    }

    private static bool IsPrivateLanIpv4(IPAddress ip)
    {
        var bytes = ip.GetAddressBytes();
        return bytes[0] == 10 ||
               (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
               (bytes[0] == 192 && bytes[1] == 168);
    }

    private static string BuildOrigin(string host, int port)
    {
        return $"http://{host}:{port}";
    }

    private static string NormalizeMdnsHostLabel(string? value)
    {
        var raw = string.IsNullOrWhiteSpace(value) ? "reel" : value.Trim().ToLowerInvariant();
        var chars = raw.Where(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-').ToArray();
        var normalized = new string(chars).Trim('-');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "reel";
        }

        if (normalized.Length > 63)
        {
            normalized = normalized[..63].Trim('-');
        }

        return string.IsNullOrWhiteSpace(normalized) ? "reel" : normalized;
    }

    private static bool TryNormalizeOrigin(string? origin, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(origin))
        {
            return false;
        }

        if (!Uri.TryCreate(origin.Trim(), UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (!uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        normalized = $"{Uri.UriSchemeHttp}://{uri.Host.ToLowerInvariant()}:{uri.Port}";
        return true;
    }
}
