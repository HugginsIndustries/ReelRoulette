using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using System.Text.Json;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class CoreSettingsServiceTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-core-settings-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void Constructor_WithoutPersistedFile_ShouldUseRuntimeDefaults()
    {
        Directory.CreateDirectory(_tempDir);

        var service = CreateService();
        var refresh = service.GetRefreshSettings();
        var backup = service.GetBackupSettings();
        var web = service.GetWebRuntimeSettings();
        var control = service.GetControlRuntimeSettings();

        Assert.True(refresh.AutoRefreshEnabled);
        Assert.Equal(15, refresh.AutoRefreshIntervalMinutes);
        Assert.False(refresh.ForceRescanLoudness);
        Assert.False(refresh.ForceRescanDuration);
        Assert.True(backup.Enabled);
        Assert.Equal(360, backup.MinimumBackupGapMinutes);
        Assert.Equal(8, backup.NumberOfBackups);
        Assert.True(web.Enabled);
        Assert.Equal(45123, web.Port);
        Assert.False(web.BindOnLan);
        Assert.Equal("reel", web.LanHostname);
        Assert.Equal("TokenRequired", web.AuthMode);
        Assert.Null(web.SharedToken);
        Assert.Equal("Off", control.AdminAuthMode);
        Assert.Null(control.AdminSharedToken);
    }

    [Fact]
    public void UpdateMethods_ShouldPersistRoundTrip()
    {
        Directory.CreateDirectory(_tempDir);
        var service = CreateService();

        service.UpdateRefreshSettings(new ReelRoulette.Server.Contracts.RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 19,
            ForceRescanLoudness = true,
            ForceRescanDuration = true
        });
        service.UpdateBackupSettings(new ReelRoulette.Server.Contracts.BackupSettingsSnapshot
        {
            Enabled = false,
            MinimumBackupGapMinutes = 480,
            NumberOfBackups = 12
        });
        service.UpdateWebRuntimeSettings(new ReelRoulette.Server.Contracts.WebRuntimeSettingsSnapshot
        {
            Enabled = true,
            Port = 51239,
            BindOnLan = false,
            LanHostname = "reeltest",
            AuthMode = "Off",
            SharedToken = null
        });
        var controlApply = service.UpdateControlRuntimeSettings(new ReelRoulette.Server.Contracts.ControlRuntimeSettingsSnapshot
        {
            AdminAuthMode = "TokenRequired",
            AdminSharedToken = "admin-token"
        });
        Assert.True(controlApply.Result.Accepted);

        var reload = CreateService();
        var refresh = reload.GetRefreshSettings();
        var backup = reload.GetBackupSettings();
        var web = reload.GetWebRuntimeSettings();
        var control = reload.GetControlRuntimeSettings();

        Assert.True(refresh.AutoRefreshEnabled);
        Assert.Equal(19, refresh.AutoRefreshIntervalMinutes);
        Assert.True(refresh.ForceRescanLoudness);
        Assert.True(refresh.ForceRescanDuration);
        Assert.False(backup.Enabled);
        Assert.Equal(480, backup.MinimumBackupGapMinutes);
        Assert.Equal(12, backup.NumberOfBackups);
        Assert.True(web.Enabled);
        Assert.Equal(51239, web.Port);
        Assert.False(web.BindOnLan);
        Assert.Equal("reeltest", web.LanHostname);
        Assert.Equal("Off", web.AuthMode);
        Assert.Null(web.SharedToken);
        Assert.Equal("TokenRequired", control.AdminAuthMode);
        Assert.Equal("admin-token", control.AdminSharedToken);
    }

    [Fact]
    public void Constructor_WithMissingSections_ShouldBackfillCoreSettingsOnStartup_AndCreateBackupWhenNoRecentBackupExists()
    {
        Directory.CreateDirectory(_tempDir);
        var settingsPath = Path.Combine(_tempDir, "core-settings.json");
        File.WriteAllText(settingsPath, """
{
  "refresh": {
    "autoRefreshEnabled": true,
    "autoRefreshIntervalMinutes": 15
  }
}
""");

        _ = CreateService();

        Assert.True(File.Exists(settingsPath));
        var saved = JsonDocument.Parse(File.ReadAllText(settingsPath)).RootElement;
        Assert.True(saved.TryGetProperty("refresh", out _));
        Assert.True(saved.TryGetProperty("backup", out _));
        Assert.True(saved.TryGetProperty("webRuntime", out _));
        Assert.True(saved.TryGetProperty("controlRuntime", out _));

        var backupDir = Path.Combine(_tempDir, "backups");
        var backupFiles = Directory.Exists(backupDir)
            ? Directory.GetFiles(backupDir, "core-settings.json.backup.*")
            : [];
        Assert.Single(backupFiles);
    }

    [Fact]
    public void Constructor_WithRecentCoreBackup_ShouldSkipStartupBackup()
    {
        Directory.CreateDirectory(_tempDir);
        SeedCoreSettingsFile();
        var backupDir = Path.Combine(_tempDir, "backups");
        Directory.CreateDirectory(backupDir);
        var recentBackup = Path.Combine(backupDir, "core-settings.json.backup.recent");
        File.WriteAllText(recentBackup, "{}");
        SetBackupTimestampUtc(recentBackup, DateTime.UtcNow.AddMinutes(-5));

        _ = CreateService(minimumBackupGapMinutes: 360);

        var backupFiles = Directory.GetFiles(backupDir, "core-settings.json.backup.*");
        Assert.Single(backupFiles);
        Assert.Equal(recentBackup, backupFiles[0]);
    }

    [Fact]
    public void UpdateRefreshSettings_WhenRecentCoreBackupExistsAtMax_ShouldSkipCreateAndDelete()
    {
        Directory.CreateDirectory(_tempDir);
        SeedCoreSettingsFile(minimumBackupGapMinutes: 360, numberOfBackups: 3);
        var backupDir = Path.Combine(_tempDir, "backups");
        Directory.CreateDirectory(backupDir);
        var backupA = Path.Combine(backupDir, "core-settings.json.backup.a");
        var backupB = Path.Combine(backupDir, "core-settings.json.backup.b");
        var backupC = Path.Combine(backupDir, "core-settings.json.backup.c");
        File.WriteAllText(backupA, "{}");
        File.WriteAllText(backupB, "{}");
        File.WriteAllText(backupC, "{}");
        SetBackupTimestampUtc(backupA, DateTime.UtcNow.AddHours(-8));
        SetBackupTimestampUtc(backupB, DateTime.UtcNow.AddHours(-7));
        SetBackupTimestampUtc(backupC, DateTime.UtcNow.AddMinutes(-10));

        var service = CreateService(minimumBackupGapMinutes: 360, numberOfBackups: 3);
        var before = Directory.GetFiles(backupDir, "core-settings.json.backup.*").OrderBy(path => path).ToArray();

        service.UpdateRefreshSettings(new ReelRoulette.Server.Contracts.RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 23,
            ForceRescanLoudness = false,
            ForceRescanDuration = false
        });

        var after = Directory.GetFiles(backupDir, "core-settings.json.backup.*").OrderBy(path => path).ToArray();
        Assert.Equal(before, after);
    }

    [Fact]
    public void UpdateRefreshSettings_WhenGapSatisfiedAtMax_ShouldCreateBackupAndTrimOldest()
    {
        Directory.CreateDirectory(_tempDir);
        SeedCoreSettingsFile(minimumBackupGapMinutes: 60, numberOfBackups: 3);
        var backupDir = Path.Combine(_tempDir, "backups");
        Directory.CreateDirectory(backupDir);
        var backupA = Path.Combine(backupDir, "core-settings.json.backup.a");
        var backupB = Path.Combine(backupDir, "core-settings.json.backup.b");
        var backupC = Path.Combine(backupDir, "core-settings.json.backup.c");
        File.WriteAllText(backupA, "{}");
        File.WriteAllText(backupB, "{}");
        File.WriteAllText(backupC, "{}");
        SetBackupTimestampUtc(backupA, DateTime.UtcNow.AddHours(-12));
        SetBackupTimestampUtc(backupB, DateTime.UtcNow.AddHours(-8));
        SetBackupTimestampUtc(backupC, DateTime.UtcNow.AddHours(-7));

        var service = CreateService(minimumBackupGapMinutes: 60, numberOfBackups: 3);
        service.UpdateRefreshSettings(new ReelRoulette.Server.Contracts.RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 29,
            ForceRescanLoudness = false,
            ForceRescanDuration = false
        });

        var after = Directory.GetFiles(backupDir, "core-settings.json.backup.*").OrderBy(path => path).ToArray();
        Assert.Equal(3, after.Length);
        Assert.DoesNotContain(backupA, after);
    }

    private CoreSettingsService CreateService(
        int minimumBackupGapMinutes = 360,
        int numberOfBackups = 8,
        bool backupEnabled = true)
    {
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15,
            BackupEnabled = backupEnabled,
            MinimumBackupGapMinutes = minimumBackupGapMinutes,
            NumberOfBackups = numberOfBackups
        };
        return new CoreSettingsService(logger, options, _tempDir);
    }

    private void SeedCoreSettingsFile(int minimumBackupGapMinutes = 360, int numberOfBackups = 8)
    {
        var settingsPath = Path.Combine(_tempDir, "core-settings.json");
        File.WriteAllText(settingsPath, $$"""
{
  "refresh": {
    "autoRefreshEnabled": true,
    "autoRefreshIntervalMinutes": 15,
    "forceRescanLoudness": false,
    "forceRescanDuration": false
  },
  "backup": {
    "enabled": true,
    "minimumBackupGapMinutes": {{minimumBackupGapMinutes}},
    "numberOfBackups": {{numberOfBackups}}
  },
  "webRuntime": {
    "enabled": true,
    "port": 45123,
    "bindOnLan": false,
    "lanHostname": "reel",
    "authMode": "TokenRequired",
    "sharedToken": null
  },
  "controlRuntime": {
    "adminAuthMode": "Off",
    "adminSharedToken": null
  }
}
""");
    }

    private static void SetBackupTimestampUtc(string path, DateTime timestampUtc)
    {
        File.SetCreationTimeUtc(path, timestampUtc);
        File.SetLastWriteTimeUtc(path, timestampUtc);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }
}
