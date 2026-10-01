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
    public void LibraryExplicitNone_RoundTripsWithANullPresetName()
    {
        var storage = CreateStorage();

        var settings = storage.Load();
        settings.LibraryExplicitNone = true;
        settings.ActivePresetName = null;
        storage.Save(settings);

        var reload = CreateStorage().Load();
        Assert.True(reload.LibraryExplicitNone);
        Assert.Null(reload.ActivePresetName);
    }

    [Fact]
    public void LoadLegacySettingsWithoutLibraryExplicitNone_DoesNotInventAHold()
    {
        File.WriteAllText(_settingsPath, """
{
  "ActivePresetName": null
}
""");

        var reload = CreateStorage().Load();
        Assert.False(reload.LibraryExplicitNone);
        Assert.Null(reload.ActivePresetName);
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

    [Theory]
    [InlineData("LibraryGridViewEnabled")]
    [InlineData("libraryGridViewEnabled")]
    public void LoadSettingsWithRetiredGridViewKey_KeepsTheOtherSettings(string retiredKey)
    {
        File.WriteAllText(_settingsPath, $$"""
{
  "{{retiredKey}}": true,
  "DevChannelEnabled": true,
  "NumberOfBackups": 3
}
""");

        var reload = CreateStorage().Load();
        Assert.True(reload.DevChannelEnabled);
        Assert.Equal(3, reload.NumberOfBackups);
    }

    [Theory]
    [InlineData("tagMatchMode")]
    [InlineData("TagMatchMode")]
    public void LoadSettingsWithSavedFilterTagMatchMode_KeepsTheFilterAndOtherSettings(string retiredKey)
    {
        File.WriteAllText(_settingsPath, $$"""
{
  "DevChannelEnabled": true,
  "FilterState": {
    "favoritesOnly": true,
    "excludeBlacklisted": false,
    "audioFilter": 1,
    "selectedTags": ["Ann", "Bob"],
    "excludedTags": ["Spoiler"],
    "{{retiredKey}}": 1,
    "categoryLocalMatchModes": { "people": 1 },
    "globalMatchMode": false,
    "includedSourceIds": ["source-1"]
  },
  "ActivePresetName": "Any person"
}
""");

        var reload = CreateStorage().Load();
        Assert.True(reload.DevChannelEnabled);
        Assert.Equal("Any person", reload.ActivePresetName);
        var filter = Assert.IsType<FilterState>(reload.FilterState);
        Assert.True(filter.FavoritesOnly);
        Assert.False(filter.ExcludeBlacklisted);
        Assert.Equal(AudioFilterMode.WithAudioOnly, filter.AudioFilter);
        Assert.Equal(["Ann", "Bob"], filter.SelectedTags);
        Assert.Equal(["Spoiler"], filter.ExcludedTags);
        Assert.Equal(TagMatchMode.Or, Assert.Contains("people", filter.CategoryLocalMatchModes!));
        Assert.False(filter.GlobalMatchMode);
        Assert.Equal(["source-1"], filter.IncludedSourceIds);
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
