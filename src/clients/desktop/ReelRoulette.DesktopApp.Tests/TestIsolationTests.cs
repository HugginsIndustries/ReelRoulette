using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class TestIsolationTests
{
    [Fact]
    public void DesktopSettingsAndBackups_ResolveUnderTheTestDirectory()
    {
        var realAppData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");

        Assert.Equal(TestIsolation.AppDataDirectory, AppDataManager.AppDataDirectory);
        Assert.Equal(Path.Combine(TestIsolation.AppDataDirectory, "desktop-settings.json"), AppDataManager.GetSettingsPath());
        Assert.StartsWith(TestIsolation.AppDataDirectory, AppDataManager.GetBackupDirectoryPath(), StringComparison.Ordinal);
        Assert.NotEqual(realAppData, AppDataManager.AppDataDirectory);
    }
}
