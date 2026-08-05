using Makaretu.Dns;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;

namespace ReelRoulette.ServerApp;

public sealed class WebUiMdnsService : IHostedService, IDisposable
{
    private readonly ILogger<WebUiMdnsService> _logger;
    private readonly CoreSettingsService _settings;
    private readonly SemaphoreSlim _sync = new(1, 1);
    private ServiceDiscovery? _mdns;
    private ServiceProfile? _profile;
    private string? _advertisedHostLabel;
    private int _advertisedPort;
    private bool _disposed;

    public WebUiMdnsService(
        ILogger<WebUiMdnsService> logger,
        CoreSettingsService settings)
    {
        _logger = logger;
        _settings = settings;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _settings.WebRuntimeSettingsChanged += OnWebRuntimeSettingsChanged;
        await ReconcileAdvertisementAsync(CloneSettings(_settings.GetWebRuntimeSettings()), "startup", cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _settings.WebRuntimeSettingsChanged -= OnWebRuntimeSettingsChanged;
        var lockTaken = false;
        try
        {
            await _sync.WaitAsync(CancellationToken.None);
            lockTaken = true;
            StopAdvertisement();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ServerApp mDNS shutdown encountered an error.");
        }
        finally
        {
            if (lockTaken)
            {
                _sync.Release();
            }
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _settings.WebRuntimeSettingsChanged -= OnWebRuntimeSettingsChanged;
        StopAdvertisement();
        _sync.Dispose();
    }

    private void OnWebRuntimeSettingsChanged(WebRuntimeSettingsSnapshot snapshot)
    {
#pragma warning disable CS4014
        ReconcileAdvertisementAsync(CloneSettings(snapshot), "settings-updated", CancellationToken.None);
#pragma warning restore CS4014
    }

    private async Task ReconcileAdvertisementAsync(
        WebRuntimeSettingsSnapshot snapshot,
        string reason,
        CancellationToken cancellationToken)
    {
        await _sync.WaitAsync(cancellationToken);
        try
        {
            if (!snapshot.Enabled || !snapshot.BindOnLan || !snapshot.MdnsEnabled)
            {
                if (_mdns != null)
                {
                    _logger.LogInformation("ServerApp mDNS disabled ({Reason}).", reason);
                }

                StopAdvertisement();
                return;
            }

            var hostLabel = NormalizeMdnsHostLabel(snapshot.LanHostname);
            var port = snapshot.Port > 0 ? snapshot.Port : 45123;
            if (_mdns != null &&
                string.Equals(_advertisedHostLabel, hostLabel, StringComparison.OrdinalIgnoreCase) &&
                _advertisedPort == port)
            {
                return;
            }

            StopAdvertisement();
            StartAdvertisement(hostLabel, port);
            _logger.LogInformation("ServerApp mDNS enabled ({Reason}) at http://{Host}.local:{Port}/.", reason, hostLabel, port);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to reconcile ServerApp mDNS advertisement.");
            StopAdvertisement();
        }
        finally
        {
            _sync.Release();
        }
    }

    private void StartAdvertisement(string hostLabel, int port)
    {
        var hostFqdn = new DomainName($"{hostLabel}.local");
        var addresses = PrivateLanNetworkAddresses.GetMdnsAdvertisementAddresses().ToArray();

        _profile = new ServiceProfile("ReelRoulette", "_http._tcp", (ushort)port, addresses);
        _profile.HostName = hostFqdn;
        foreach (var srv in _profile.Resources.OfType<SRVRecord>())
        {
            srv.Target = hostFqdn;
        }

        foreach (var addr in _profile.Resources.OfType<AddressRecord>())
        {
            addr.Name = hostFqdn;
        }

        _profile.AddProperty("path", "/");
        _profile.AddProperty("host", $"{hostLabel}.local");

        _mdns = new ServiceDiscovery();
        _mdns.Advertise(_profile);
        RemoveReverseLookupRecords(_mdns);
        _mdns.Announce(_profile);

        _advertisedHostLabel = hostLabel;
        _advertisedPort = port;
    }

    private static void RemoveReverseLookupRecords(ServiceDiscovery mdns)
    {
        var catalog = mdns.NameServer.Catalog;
        var reverseNames = catalog.Keys
            .Where(IsReverseLookupDomain)
            .ToList();

        foreach (var name in reverseNames)
        {
            catalog.TryRemove(name, out _);
        }
    }

    private static bool IsReverseLookupDomain(DomainName name)
    {
        var text = name.ToString();
        return text.EndsWith(".in-addr.arpa", StringComparison.OrdinalIgnoreCase)
               || text.EndsWith(".ip6.arpa", StringComparison.OrdinalIgnoreCase);
    }

    private void StopAdvertisement()
    {
        try
        {
            if (_mdns != null && _profile != null)
            {
                _mdns.Unadvertise(_profile);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "ServerApp mDNS unadvertise failed.");
        }
        finally
        {
            _advertisedHostLabel = null;
            _advertisedPort = 0;
            _profile = null;
            _mdns?.Dispose();
            _mdns = null;
        }
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

    private static WebRuntimeSettingsSnapshot CloneSettings(WebRuntimeSettingsSnapshot source)
    {
        return new WebRuntimeSettingsSnapshot
        {
            Enabled = source.Enabled,
            Port = source.Port,
            BindOnLan = source.BindOnLan,
            MdnsEnabled = source.MdnsEnabled,
            LanHostname = source.LanHostname,
            AuthMode = source.AuthMode,
            SharedToken = source.SharedToken
        };
    }
}
