using System.Linq;
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
    private readonly string _backupDirectory;
    private readonly RefreshSettingsSnapshot _refreshSettings;
    private readonly BackupSettingsSnapshot _backupSettings;
    private readonly WebRuntimeSettingsSnapshot _webRuntimeSettings;
    private readonly ControlRuntimeSettingsSnapshot _controlRuntimeSettings;
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
        _backupDirectory = Path.Combine(roamingAppData, "backups");
        var loaded = LoadSettings(options);
        (_refreshSettings, _backupSettings, _webRuntimeSettings, _controlRuntimeSettings) = loaded.Settings;
        if (loaded.NeedsStartupBackfillPersist)
        {
            PersistSettings(createBackup: false);
        }
        CreateBackupIfNeeded();
    }

    public RefreshSettingsSnapshot GetRefreshSettings()
    {
        lock (_lock)
        {
            return new RefreshSettingsSnapshot
            {
                AutoRefreshEnabled = _refreshSettings.AutoRefreshEnabled,
                AutoRefreshIntervalMinutes = _refreshSettings.AutoRefreshIntervalMinutes,
                ForceRescanLoudness = _refreshSettings.ForceRescanLoudness,
                ForceRescanDuration = _refreshSettings.ForceRescanDuration
            };
        }
    }

    public RefreshSettingsSnapshot UpdateRefreshSettings(RefreshSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            _refreshSettings.AutoRefreshEnabled = snapshot.AutoRefreshEnabled;
            _refreshSettings.AutoRefreshIntervalMinutes = Math.Clamp(snapshot.AutoRefreshIntervalMinutes, 5, 1440);
            _refreshSettings.ForceRescanLoudness = snapshot.ForceRescanLoudness;
            _refreshSettings.ForceRescanDuration = snapshot.ForceRescanDuration;
            PersistSettings();
            return GetRefreshSettings();
        }
    }

    public BackupSettingsSnapshot GetBackupSettings()
    {
        lock (_lock)
        {
            return new BackupSettingsSnapshot
            {
                Enabled = _backupSettings.Enabled,
                MinimumBackupGapMinutes = _backupSettings.MinimumBackupGapMinutes,
                NumberOfBackups = _backupSettings.NumberOfBackups
            };
        }
    }

    public BackupSettingsSnapshot UpdateBackupSettings(BackupSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            _backupSettings.Enabled = snapshot.Enabled;
            _backupSettings.MinimumBackupGapMinutes = Math.Clamp(snapshot.MinimumBackupGapMinutes, 1, 10080);
            _backupSettings.NumberOfBackups = Math.Clamp(snapshot.NumberOfBackups, 1, 100);
            PersistSettings();
            return GetBackupSettings();
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
            var normalizedPort = snapshot.Port > 0 ? snapshot.Port : 45123;
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

    public ControlRuntimeSettingsSnapshot GetControlRuntimeSettings()
    {
        lock (_lock)
        {
            return new ControlRuntimeSettingsSnapshot
            {
                AdminAuthMode = _controlRuntimeSettings.AdminAuthMode,
                AdminSharedToken = _controlRuntimeSettings.AdminSharedToken
            };
        }
    }

    public (ControlRuntimeSettingsSnapshot Settings, ControlApplyResult Result) UpdateControlRuntimeSettings(ControlRuntimeSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            var normalizedAuthMode = NormalizeAuthMode(snapshot.AdminAuthMode);
            var normalizedSharedToken = string.IsNullOrWhiteSpace(snapshot.AdminSharedToken) ? null : snapshot.AdminSharedToken.Trim();
            var errors = new List<string>();
            var restartRequired = false;

            if (string.Equals(normalizedAuthMode, "TokenRequired", StringComparison.OrdinalIgnoreCase) &&
                string.IsNullOrWhiteSpace(normalizedSharedToken))
            {
                errors.Add("adminSharedToken is required when adminAuthMode is TokenRequired.");
            }

            if (errors.Count == 0)
            {
                restartRequired =
                    !string.Equals(_controlRuntimeSettings.AdminAuthMode, normalizedAuthMode, StringComparison.Ordinal) ||
                    !string.Equals(_controlRuntimeSettings.AdminSharedToken, normalizedSharedToken, StringComparison.Ordinal);

                _controlRuntimeSettings.AdminAuthMode = normalizedAuthMode;
                _controlRuntimeSettings.AdminSharedToken = normalizedSharedToken;
                PersistSettings();
            }

            return (
                GetControlRuntimeSettings(),
                new ControlApplyResult
                {
                    Accepted = errors.Count == 0,
                    RestartRequired = restartRequired,
                    Message = errors.Count == 0
                        ? (restartRequired ? "Applied. Restart required to take effect." : "Applied. No restart required.")
                        : "Validation failed.",
                    Errors = errors
                });
        }
    }

    private ((RefreshSettingsSnapshot Refresh, BackupSettingsSnapshot Backup, WebRuntimeSettingsSnapshot WebRuntime, ControlRuntimeSettingsSnapshot ControlRuntime) Settings, bool NeedsStartupBackfillPersist) LoadSettings(ServerRuntimeOptions options)
    {
        var refresh = new RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = options.AutoRefreshEnabled,
            AutoRefreshIntervalMinutes = options.AutoRefreshIntervalMinutes,
            ForceRescanLoudness = options.ForceRescanLoudness,
            ForceRescanDuration = options.ForceRescanDuration
        };
        var backup = new BackupSettingsSnapshot
        {
            Enabled = options.BackupEnabled,
            MinimumBackupGapMinutes = Math.Clamp(options.MinimumBackupGapMinutes, 1, 10080),
            NumberOfBackups = Math.Clamp(options.NumberOfBackups, 1, 100)
        };
        var webRuntime = new WebRuntimeSettingsSnapshot();
        var controlRuntime = new ControlRuntimeSettingsSnapshot
        {
            AdminAuthMode = NormalizeAuthMode(options.ControlAdminAuthMode),
            AdminSharedToken = string.IsNullOrWhiteSpace(options.ControlAdminSharedToken) ? null : options.ControlAdminSharedToken.Trim()
        };
        var needsStartupBackfillPersist = !File.Exists(_settingsPath);
        try
        {
            if (File.Exists(_settingsPath))
            {
                var text = File.ReadAllText(_settingsPath);
                var parsed = JsonSerializer.Deserialize<CoreSettingsDocument>(text, JsonOptions);
                if (parsed != null)
                {
                    needsStartupBackfillPersist |= HasMissingTopLevelSettingsSectionsOrFields(text);

                    if (parsed.Refresh != null)
                    {
                        refresh.AutoRefreshEnabled = parsed.Refresh.AutoRefreshEnabled;
                        refresh.AutoRefreshIntervalMinutes = Math.Clamp(parsed.Refresh.AutoRefreshIntervalMinutes, 5, 1440);
                        refresh.ForceRescanLoudness = parsed.Refresh.ForceRescanLoudness;
                        refresh.ForceRescanDuration = parsed.Refresh.ForceRescanDuration;
                    }

                    if (parsed.Backup != null)
                    {
                        backup.Enabled = parsed.Backup.Enabled;
                        backup.MinimumBackupGapMinutes = Math.Clamp(parsed.Backup.MinimumBackupGapMinutes, 1, 10080);
                        backup.NumberOfBackups = Math.Clamp(parsed.Backup.NumberOfBackups, 1, 100);
                    }

                    if (parsed.WebRuntime != null)
                    {
                        webRuntime.Enabled = parsed.WebRuntime.Enabled;
                        webRuntime.Port = parsed.WebRuntime.Port > 0 ? parsed.WebRuntime.Port : 45123;
                        webRuntime.BindOnLan = parsed.WebRuntime.BindOnLan;
                        webRuntime.LanHostname = string.IsNullOrWhiteSpace(parsed.WebRuntime.LanHostname) ? "reel" : parsed.WebRuntime.LanHostname.Trim();
                        webRuntime.AuthMode = string.IsNullOrWhiteSpace(parsed.WebRuntime.AuthMode) ? "TokenRequired" : parsed.WebRuntime.AuthMode.Trim();
                        webRuntime.SharedToken = string.IsNullOrWhiteSpace(parsed.WebRuntime.SharedToken) ? null : parsed.WebRuntime.SharedToken.Trim();
                    }

                    if (parsed.ControlRuntime != null)
                    {
                        controlRuntime.AdminAuthMode = NormalizeAuthMode(parsed.ControlRuntime.AdminAuthMode);
                        controlRuntime.AdminSharedToken = string.IsNullOrWhiteSpace(parsed.ControlRuntime.AdminSharedToken)
                            ? null
                            : parsed.ControlRuntime.AdminSharedToken.Trim();
                    }

                    return ((refresh, backup, webRuntime, controlRuntime), needsStartupBackfillPersist);
                }

                // Existing file present but not parseable as the current schema - rewrite to canonical schema.
                needsStartupBackfillPersist = true;
            }
        }
        catch
        {
            // fall back to runtime defaults
        }

        return ((refresh, backup, webRuntime, controlRuntime), needsStartupBackfillPersist);
    }

    private void PersistSettings(bool createBackup = true)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        if (createBackup)
        {
            CreateBackupIfNeeded();
        }
        File.WriteAllText(
            _settingsPath,
            JsonSerializer.Serialize(new CoreSettingsDocument
            {
                Refresh = _refreshSettings,
                Backup = _backupSettings,
                WebRuntime = _webRuntimeSettings,
                ControlRuntime = _controlRuntimeSettings
            }, JsonOptions));
    }

    private static bool HasMissingTopLevelSettingsSectionsOrFields(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return true;
            }

            var root = document.RootElement;

            if (!root.TryGetProperty("refresh", out var refresh) ||
                refresh.ValueKind != JsonValueKind.Object ||
                !HasObjectProperty(refresh, "autoRefreshEnabled") ||
                !HasObjectProperty(refresh, "autoRefreshIntervalMinutes") ||
                !HasObjectProperty(refresh, "forceRescanLoudness") ||
                !HasObjectProperty(refresh, "forceRescanDuration"))
            {
                return true;
            }

            if (!root.TryGetProperty("backup", out var backup) ||
                backup.ValueKind != JsonValueKind.Object ||
                !HasObjectProperty(backup, "enabled") ||
                !HasObjectProperty(backup, "minimumBackupGapMinutes") ||
                !HasObjectProperty(backup, "numberOfBackups"))
            {
                return true;
            }

            if (!root.TryGetProperty("webRuntime", out var webRuntime) ||
                webRuntime.ValueKind != JsonValueKind.Object ||
                !HasObjectProperty(webRuntime, "enabled") ||
                !HasObjectProperty(webRuntime, "port") ||
                !HasObjectProperty(webRuntime, "bindOnLan") ||
                !HasObjectProperty(webRuntime, "lanHostname") ||
                !HasObjectProperty(webRuntime, "authMode") ||
                !HasObjectProperty(webRuntime, "sharedToken"))
            {
                return true;
            }

            if (!root.TryGetProperty("controlRuntime", out var controlRuntime) ||
                controlRuntime.ValueKind != JsonValueKind.Object ||
                !HasObjectProperty(controlRuntime, "adminAuthMode") ||
                !HasObjectProperty(controlRuntime, "adminSharedToken"))
            {
                return true;
            }

            return false;
        }
        catch
        {
            return true;
        }
    }

    private static bool HasObjectProperty(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out _);
    }

    private void CreateBackupIfNeeded()
    {
        if (!_backupSettings.Enabled || !File.Exists(_settingsPath))
        {
            return;
        }

        Directory.CreateDirectory(_backupDirectory);
        var backupFiles = Directory.GetFiles(_backupDirectory, "core-settings.json.backup.*")
            .Select(path => new FileInfo(path))
            .OrderBy(GetBackupFileUtcTimestamp)
            .ToList();

        var maxBackups = Math.Max(1, _backupSettings.NumberOfBackups);
        var minGapMinutes = Math.Max(1, _backupSettings.MinimumBackupGapMinutes);
        var nowUtc = DateTime.UtcNow;
        var lastBackupTime = backupFiles.Count > 0 ? GetBackupFileUtcTimestamp(backupFiles[^1]) : DateTime.MinValue;
        var hasLastBackup = backupFiles.Count > 0;
        var timeSinceLastBackup = hasLastBackup ? nowUtc - lastBackupTime : TimeSpan.MaxValue;

        if (hasLastBackup && timeSinceLastBackup.TotalMinutes < minGapMinutes)
        {
            return;
        }

        var timestamp = nowUtc.ToString("yyyy-MM-dd_HH-mm-ss");
        var backupPath = Path.Combine(_backupDirectory, $"core-settings.json.backup.{timestamp}");
        File.Copy(_settingsPath, backupPath, true);

        var filesAfterCreate = Directory.GetFiles(_backupDirectory, "core-settings.json.backup.*")
            .Select(path => new FileInfo(path))
            .OrderBy(GetBackupFileUtcTimestamp)
            .ToList();

        while (filesAfterCreate.Count > maxBackups)
        {
            filesAfterCreate[0].Delete();
            filesAfterCreate.RemoveAt(0);
        }
    }

    private static DateTime GetBackupFileUtcTimestamp(FileInfo file)
    {
        var creationUtc = file.CreationTimeUtc;
        var lastWriteUtc = file.LastWriteTimeUtc;
        if (creationUtc == DateTime.MinValue)
        {
            return lastWriteUtc;
        }

        if (lastWriteUtc == DateTime.MinValue)
        {
            return creationUtc;
        }

        return creationUtc >= lastWriteUtc ? creationUtc : lastWriteUtc;
    }

    private static string NormalizeAuthMode(string? value)
    {
        if (string.Equals(value, "TokenRequired", StringComparison.OrdinalIgnoreCase))
        {
            return "TokenRequired";
        }

        return "Off";
    }

    private sealed class CoreSettingsDocument
    {
        public RefreshSettingsSnapshot? Refresh { get; set; }
        public BackupSettingsSnapshot? Backup { get; set; }
        public WebRuntimeSettingsSnapshot? WebRuntime { get; set; }
        public ControlRuntimeSettingsSnapshot? ControlRuntime { get; set; }
    }
}
