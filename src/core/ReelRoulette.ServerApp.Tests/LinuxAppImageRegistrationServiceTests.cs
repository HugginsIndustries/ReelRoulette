using ReelRoulette.ServerApp.Hosting;
using Xunit;

namespace ReelRoulette.ServerApp.Tests;

public sealed class LinuxAppImageRegistrationServiceTests : IDisposable
{
    // The server project copies its icons next to the executable; the build puts them next to this assembly too.
    private static readonly string SourceDirectory = AppContext.BaseDirectory;

    private readonly string _root = Path.Combine(Path.GetTempPath(), "reelroulette-appimage-registration-" + Guid.NewGuid().ToString("N"));
    private readonly string _dataHome;
    private readonly string _appImagePath;

    public LinuxAppImageRegistrationServiceTests()
    {
        _dataHome = Path.Combine(_root, "data-home");
        _appImagePath = Path.Combine(_root, "apps", "ReelRoulette Server.AppImage");
    }

    private string DesktopEntryPath => Path.Combine(_dataHome, "applications", "reelroulette-server.desktop");

    private string Icon256Path => Path.Combine(_dataHome, "icons", "hicolor", "256x256", "apps", "reelroulette-server.png");

    private string IconSvgPath => Path.Combine(_dataHome, "icons", "hicolor", "scalable", "apps", "reelroulette-server.svg");

    private string Icon512Path => Path.Combine(_dataHome, "icons", "hicolor", "512x512", "apps", "reelroulette-server.png");

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    [Fact]
    public void FreshDataHomeGetsTheMenuEntryAndBothIcons()
    {
        var changes = Register();

        Assert.True(changes.AnyChanged);
        var desktopLines = File.ReadAllLines(DesktopEntryPath);
        Assert.Contains("Icon=reelroulette-server", desktopLines);
        Assert.Contains($"Exec=\"{_appImagePath}\"", desktopLines);
        Assert.Equal(File.ReadAllBytes(Path.Combine(SourceDirectory, "icon-256.png")), File.ReadAllBytes(Icon256Path));
        Assert.Equal(File.ReadAllBytes(Path.Combine(SourceDirectory, "logo-icon.svg")), File.ReadAllBytes(IconSvgPath));
        Assert.False(File.Exists(Icon512Path));
    }

    [Fact]
    public void OldInstallGetsTheNewIconsAndLosesThe512PixelIcon()
    {
        Register();
        // An install from before the new logo: the old 256 px icon, a 512 px icon, and no scalable icon.
        File.WriteAllBytes(Icon256Path, [1, 2, 3, 4]);
        File.Delete(IconSvgPath);
        Directory.CreateDirectory(Path.GetDirectoryName(Icon512Path)!);
        File.WriteAllBytes(Icon512Path, [5, 6, 7, 8]);

        var changes = Register();

        Assert.True(changes.Icon256Changed);
        Assert.True(changes.IconSvgChanged);
        Assert.True(changes.LegacyIcon512Removed);
        Assert.False(changes.DesktopChanged);
        Assert.Equal(File.ReadAllBytes(Path.Combine(SourceDirectory, "icon-256.png")), File.ReadAllBytes(Icon256Path));
        Assert.True(File.Exists(IconSvgPath));
        Assert.False(File.Exists(Icon512Path));
    }

    [Fact]
    public void LeftOver512PixelIconAloneCountsAsAChange()
    {
        Register();
        Directory.CreateDirectory(Path.GetDirectoryName(Icon512Path)!);
        File.WriteAllBytes(Icon512Path, [5, 6, 7, 8]);

        var changes = Register();

        Assert.True(changes.AnyChanged);
        Assert.False(File.Exists(Icon512Path));
    }

    [Fact]
    public void SecondRunChangesNothing()
    {
        Register();
        var desktopWritten = File.GetLastWriteTimeUtc(DesktopEntryPath);

        var changes = Register();

        Assert.False(changes.AnyChanged);
        Assert.Equal(desktopWritten, File.GetLastWriteTimeUtc(DesktopEntryPath));
    }

    private LinuxAppImageRegistrationService.RegistrationChanges Register() =>
        LinuxAppImageRegistrationService.ReconcileRegistration(_appImagePath, SourceDirectory, _dataHome);
}
