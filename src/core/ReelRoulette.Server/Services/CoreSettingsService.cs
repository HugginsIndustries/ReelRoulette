using System.Text.Json;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;

namespace ReelRoulette.Server.Services;

public sealed class CoreSettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly object _lock = new();
    private readonly ILogger<CoreSettingsService> _logger;
    private readonly string _settingsPath;
    private readonly RefreshSettingsSnapshot _refreshSettings;
    private readonly WebRuntimeSettingsSnapshot _webRuntimeSettings;
    public event Action<WebRuntimeSettingsSnapshot>? WebRuntimeSettingsChanged;

    public CoreSettingsService(
        ILogger<CoreSettingsService> logger,
        ServerRuntimeOptions options,
        string? appDataPathOverride = null)
    {
        _logger = logger;
        var roamingAppData = appDataPathOverride ??
                             Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(roamingAppData);
        _settingsPath = Path.Combine(roamingAppData, "core-settings.json");
        (_refreshSettings, _webRuntimeSettings) = LoadSettings(options);
    }

    public RefreshSettingsSnapshot GetRefreshSettings()
    {
        lock (_lock)
        {
            return new RefreshSettingsSnapshot
            {
                AutoRefreshEnabled = _refreshSettings.AutoRefreshEnabled,
                AutoRefreshIntervalMinutes = _refreshSettings.AutoRefreshIntervalMinutes
            };
        }
    }

    public RefreshSettingsSnapshot UpdateRefreshSettings(RefreshSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            _refreshSettings.AutoRefreshEnabled = snapshot.AutoRefreshEnabled;
            _refreshSettings.AutoRefreshIntervalMinutes = Math.Clamp(snapshot.AutoRefreshIntervalMinutes, 5, 1440);
            PersistSettings();
            return GetRefreshSettings();
        }
    }

    public WebRuntimeSettingsSnapshot GetWebRuntimeSettings()
    {
        lock (_lock)
        {
            return new WebRuntimeSettingsSnapshot
            {
                Enabled = _webRuntimeSettings.Enabled,
                Port = _webRuntimeSettings.Port,
                BindOnLan = _webRuntimeSettings.BindOnLan,
                LanHostname = _webRuntimeSettings.LanHostname,
                AuthMode = _webRuntimeSettings.AuthMode,
                SharedToken = _webRuntimeSettings.SharedToken
            };
        }
    }

    public WebRuntimeSettingsSnapshot UpdateWebRuntimeSettings(WebRuntimeSettingsSnapshot snapshot)
    {
        WebRuntimeSettingsSnapshot updated;
        var changed = false;
        lock (_lock)
        {
            var normalizedPort = snapshot.Port > 0 ? snapshot.Port : 51234;
            var normalizedHost = string.IsNullOrWhiteSpace(snapshot.LanHostname) ? "reel" : snapshot.LanHostname.Trim();
            var normalizedAuthMode = string.IsNullOrWhiteSpace(snapshot.AuthMode) ? "TokenRequired" : snapshot.AuthMode.Trim();
            var normalizedSharedToken = string.IsNullOrWhiteSpace(snapshot.SharedToken) ? null : snapshot.SharedToken.Trim();

            changed = _webRuntimeSettings.Enabled != snapshot.Enabled ||
                      _webRuntimeSettings.Port != normalizedPort ||
                      _webRuntimeSettings.BindOnLan != snapshot.BindOnLan ||
                      !string.Equals(_webRuntimeSettings.LanHostname, normalizedHost, StringComparison.Ordinal) ||
                      !string.Equals(_webRuntimeSettings.AuthMode, normalizedAuthMode, StringComparison.Ordinal) ||
                      !string.Equals(_webRuntimeSettings.SharedToken, normalizedSharedToken, StringComparison.Ordinal);

            _webRuntimeSettings.Enabled = snapshot.Enabled;
            _webRuntimeSettings.Port = normalizedPort;
            _webRuntimeSettings.BindOnLan = snapshot.BindOnLan;
            _webRuntimeSettings.LanHostname = normalizedHost;
            _webRuntimeSettings.AuthMode = normalizedAuthMode;
            _webRuntimeSettings.SharedToken = normalizedSharedToken;
            if (changed)
            {
                PersistSettings();
            }

            updated = GetWebRuntimeSettings();
        }

        if (changed)
        {
            WebRuntimeSettingsChanged?.Invoke(updated);
        }

        return updated;
    }

    private (RefreshSettingsSnapshot Refresh, WebRuntimeSettingsSnapshot WebRuntime) LoadSettings(ServerRuntimeOptions options)
    {
        var refresh = new RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = options.AutoRefreshEnabled,
            AutoRefreshIntervalMinutes = options.AutoRefreshIntervalMinutes
        };
        var webRuntime = new WebRuntimeSettingsSnapshot();
        try
        {
            if (File.Exists(_settingsPath))
            {
                var parsed = JsonSerializer.Deserialize<CoreSettingsDocument>(File.ReadAllText(_settingsPath), JsonOptions);
                if (parsed != null)
                {
                    if (parsed.Refresh != null)
                    {
                        refresh.AutoRefreshEnabled = parsed.Refresh.AutoRefreshEnabled;
                        refresh.AutoRefreshIntervalMinutes = Math.Clamp(parsed.Refresh.AutoRefreshIntervalMinutes, 5, 1440);
                    }

                    if (parsed.WebRuntime != null)
                    {
                        webRuntime.Enabled = parsed.WebRuntime.Enabled;
                        webRuntime.Port = parsed.WebRuntime.Port > 0 ? parsed.WebRuntime.Port : 51234;
                        webRuntime.BindOnLan = parsed.WebRuntime.BindOnLan;
                        webRuntime.LanHostname = string.IsNullOrWhiteSpace(parsed.WebRuntime.LanHostname) ? "reel" : parsed.WebRuntime.LanHostname.Trim();
                        webRuntime.AuthMode = string.IsNullOrWhiteSpace(parsed.WebRuntime.AuthMode) ? "TokenRequired" : parsed.WebRuntime.AuthMode.Trim();
                        webRuntime.SharedToken = string.IsNullOrWhiteSpace(parsed.WebRuntime.SharedToken) ? null : parsed.WebRuntime.SharedToken.Trim();
                    }

                    return (refresh, webRuntime);
                }
            }
        }
        catch
        {
            // fall back to runtime defaults
        }

        return (refresh, webRuntime);
    }

    private void PersistSettings()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        File.WriteAllText(
            _settingsPath,
            JsonSerializer.Serialize(new CoreSettingsDocument
            {
                Refresh = _refreshSettings,
                WebRuntime = _webRuntimeSettings
            }, JsonOptions));
    }

    private sealed class CoreSettingsDocument
    {
        public RefreshSettingsSnapshot? Refresh { get; set; }
        public WebRuntimeSettingsSnapshot? WebRuntime { get; set; }
    }
}
