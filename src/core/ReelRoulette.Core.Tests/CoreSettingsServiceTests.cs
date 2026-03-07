using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
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
        var web = service.GetWebRuntimeSettings();
        var control = service.GetControlRuntimeSettings();

        Assert.True(refresh.AutoRefreshEnabled);
        Assert.Equal(15, refresh.AutoRefreshIntervalMinutes);
        Assert.True(web.Enabled);
        Assert.Equal(51234, web.Port);
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
            AutoRefreshIntervalMinutes = 19
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
        var web = reload.GetWebRuntimeSettings();
        var control = reload.GetControlRuntimeSettings();

        Assert.True(refresh.AutoRefreshEnabled);
        Assert.Equal(19, refresh.AutoRefreshIntervalMinutes);
        Assert.True(web.Enabled);
        Assert.Equal(51239, web.Port);
        Assert.False(web.BindOnLan);
        Assert.Equal("reeltest", web.LanHostname);
        Assert.Equal("Off", web.AuthMode);
        Assert.Null(web.SharedToken);
        Assert.Equal("TokenRequired", control.AdminAuthMode);
        Assert.Equal("admin-token", control.AdminSharedToken);
    }

    private CoreSettingsService CreateService()
    {
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15
        };
        return new CoreSettingsService(logger, options, _tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }
}
