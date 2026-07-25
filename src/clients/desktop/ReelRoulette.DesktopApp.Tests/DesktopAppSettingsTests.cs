using ReelRoulette.Core.Storage;
using System.Text.Json;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class DesktopAppSettingsTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-desktop-settings-tests", Guid.NewGuid().ToString("N"));
    private readonly string _settingsPath;

    public DesktopAppSettingsTests()
    {
        Directory.CreateDirectory(_tempDir);
        _settingsPath = Path.Combine(_tempDir, "desktop-settings.json");
    }

    [Fact]
    public void DevChannelEnabled_ShouldRoundTripThroughSaveAndLoad()
    {
        var storage = CreateStorage();

        var settings = storage.Load();
        settings.DevChannelEnabled = true;
        settings.ForceApiPlayback = false;
        storage.Save(settings);

        var reload = CreateStorage().Load();
        Assert.True(reload.DevChannelEnabled);
        Assert.False(reload.ForceApiPlayback);
    }

    [Fact]
    public void SaveUnrelatedSettings_ShouldPreserveDevChannelEnabled()
    {
        var storage = CreateStorage();

        var settings = storage.Load();
        settings.DevChannelEnabled = true;
        storage.Save(settings);

        settings = storage.Load();
        settings.ForceApiPlayback = true;
        settings.LoopEnabled = false;
        storage.Save(settings);

        var reload = CreateStorage().Load();
        Assert.True(reload.DevChannelEnabled);
        Assert.True(reload.ForceApiPlayback);
        Assert.False(reload.LoopEnabled);
    }

    [Fact]
    public void LoadLegacySettingsWithoutDevChannel_ShouldDefaultToStable()
    {
        File.WriteAllText(_settingsPath, """
{
  "LoopEnabled": true,
  "ForceApiPlayback": false
}
""");

        var reload = CreateStorage().Load();
        Assert.False(reload.DevChannelEnabled);
    }

    private SettingsStorageService<DesktopAppSettings> CreateStorage()
    {
        return new SettingsStorageService<DesktopAppSettings>(new JsonFileStorageOptions<DesktopAppSettings>
        {
            FilePathResolver = () => _settingsPath,
            CreateDefault = () => new DesktopAppSettings(),
            SerializerOptions = new JsonSerializerOptions { WriteIndented = true }
        });
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
            {
                Directory.Delete(_tempDir, recursive: true);
            }
        }
        catch
        {
            // Best-effort temp cleanup for tests.
        }
    }
}
