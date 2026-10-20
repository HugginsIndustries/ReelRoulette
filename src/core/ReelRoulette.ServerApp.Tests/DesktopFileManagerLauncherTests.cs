using System.ComponentModel;
using System.Diagnostics;
using ReelRoulette.Server.Hosting;
using ReelRoulette.ServerApp.Hosting;
using Xunit;

namespace ReelRoulette.ServerApp.Tests;

/// <summary>
/// The desktop file manager launch: Explorer with the file selected on Windows, the FileManager1 ShowItems call on
/// Linux with xdg-open on the folder as the fallback, never through a shell, and available only with a desktop.
/// </summary>
public sealed class DesktopFileManagerLauncherTests
{
    private const string SessionBus = "unix:path=/run/user/1000/bus";

    [Fact]
    public async Task Windows_StartsExplorerWithTheFileSelected_WithoutAShell()
    {
        var fake = new Fakes(FileManagerPlatform.Windows);

        var result = await fake.Launcher.ShowAsync(@"C:\a b\c,d.mp4", CancellationToken.None);

        Assert.Equal(FileManagerShowResult.Succeeded(FileManagerShowResult.ShownWithExplorer), result);
        var start = Assert.Single(fake.Started);
        Assert.EndsWith("explorer.exe", start.FileName);
        Assert.Equal("/select,\"C:\\a b\\c,d.mp4\"", start.Arguments);
        Assert.Empty(start.ArgumentList);
        Assert.False(start.UseShellExecute);
        Assert.Empty(fake.ShowItemsUris);
    }

    [Theory]
    [InlineData("/media/nas/a b/c#d%41e,f'g [h].mp4", "file:///media/nas/a%20b/c%23d%2541e%2Cf%27g%20%5Bh%5D.mp4")]
    [InlineData("/media/nas/café/ü.mp4", "file:///media/nas/caf%C3%A9/%C3%BC.mp4")]
    public async Task Linux_WithASessionBus_AsksTheFileManagerToSelectTheFile(string fullPath, string expectedUri)
    {
        var fake = new Fakes(FileManagerPlatform.Linux, ("DISPLAY", ":0"), ("DBUS_SESSION_BUS_ADDRESS", SessionBus));

        var result = await fake.Launcher.ShowAsync(fullPath, CancellationToken.None);

        Assert.Equal(FileManagerShowResult.Succeeded(FileManagerShowResult.ShownWithDbus), result);
        Assert.Equal(expectedUri, Assert.Single(fake.ShowItemsUris));
        Assert.Empty(fake.Started);
    }

    [Fact]
    public async Task Linux_WhenTheDbusCallFails_OpensTheFolderWithXdgOpen_WithoutAShell()
    {
        var fake = new Fakes(FileManagerPlatform.Linux, ("DISPLAY", ":0"), ("DBUS_SESSION_BUS_ADDRESS", SessionBus))
        {
            ShowItemsError = new InvalidOperationException("org.freedesktop.DBus.Error.ServiceUnknown")
        };

        var result = await fake.Launcher.ShowAsync("/media/nas/a b/c.mp4", CancellationToken.None);

        Assert.Equal(FileManagerShowResult.Succeeded(FileManagerShowResult.ShownWithXdgOpen), result);
        Assert.Single(fake.ShowItemsUris);
        AssertXdgOpen(Assert.Single(fake.Started), "/media/nas/a b");
    }

    [Fact]
    public async Task Linux_WithoutASessionBus_OpensTheFolderWithXdgOpen()
    {
        var fake = new Fakes(FileManagerPlatform.Linux, ("WAYLAND_DISPLAY", "wayland-0"));

        var result = await fake.Launcher.ShowAsync("/media/nas/a b/c.mp4", CancellationToken.None);

        Assert.Equal(FileManagerShowResult.Succeeded(FileManagerShowResult.ShownWithXdgOpen), result);
        Assert.Empty(fake.ShowItemsUris);
        AssertXdgOpen(Assert.Single(fake.Started), "/media/nas/a b");
    }

    [Fact]
    public async Task Linux_WhenXdgOpenFailsToo_ReportsTheFailure()
    {
        var fake = new Fakes(FileManagerPlatform.Linux, ("DISPLAY", ":0"), ("DBUS_SESSION_BUS_ADDRESS", SessionBus))
        {
            ShowItemsError = new InvalidOperationException("no file manager"),
            StartError = new Win32Exception(2)
        };

        var result = await fake.Launcher.ShowAsync("/media/nas/a b/c.mp4", CancellationToken.None);

        Assert.False(result.Shown);
        Assert.Null(result.ShownWith);
        Assert.Equal(nameof(Win32Exception), result.ErrorType);
    }

    [Theory]
    [InlineData("Windows", null, null, null, true)]
    [InlineData("Linux", ":0", null, null, true)]
    [InlineData("Linux", null, "wayland-0", null, true)]
    [InlineData("Linux", null, null, SessionBus, false)]
    [InlineData("Linux", " ", "", null, false)]
    [InlineData("Other", ":0", "wayland-0", SessionBus, false)]
    public void IsAvailable_NeedsADesktop(string platform, string? display, string? wayland, string? sessionBus, bool expected)
    {
        var fake = new Fakes(Enum.Parse<FileManagerPlatform>(platform), ("DISPLAY", display), ("WAYLAND_DISPLAY", wayland), ("DBUS_SESSION_BUS_ADDRESS", sessionBus));

        Assert.Equal(expected, fake.Launcher.IsAvailable);
    }

    private static void AssertXdgOpen(ProcessStartInfo start, string folder)
    {
        Assert.Equal("xdg-open", start.FileName);
        Assert.Equal(folder, Assert.Single(start.ArgumentList));
        Assert.Equal("", start.Arguments);
        Assert.False(start.UseShellExecute);
    }

    private sealed class Fakes
    {
        private readonly Dictionary<string, string?> _environment;

        public Fakes(FileManagerPlatform platform, params (string Name, string? Value)[] environment)
        {
            _environment = environment.ToDictionary(variable => variable.Name, variable => variable.Value);
            Launcher = new DesktopFileManagerLauncher(
                platform,
                name => _environment.GetValueOrDefault(name),
                startInfo =>
                {
                    Started.Add(startInfo);
                    if (StartError != null)
                    {
                        throw StartError;
                    }
                },
                (uri, _) =>
                {
                    ShowItemsUris.Add(uri);
                    return ShowItemsError == null ? Task.CompletedTask : Task.FromException(ShowItemsError);
                });
        }

        public DesktopFileManagerLauncher Launcher { get; }

        public List<ProcessStartInfo> Started { get; } = [];

        public List<string> ShowItemsUris { get; } = [];

        public Exception? ShowItemsError { get; init; }

        public Exception? StartError { get; init; }
    }
}
