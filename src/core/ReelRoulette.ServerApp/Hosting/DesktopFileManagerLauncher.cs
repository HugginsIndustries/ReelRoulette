using System.Diagnostics;
using ReelRoulette.Server.Hosting;
using Tmds.DBus.Protocol;

namespace ReelRoulette.ServerApp.Hosting;

internal enum FileManagerPlatform
{
    Windows,
    Linux,
    Other
}

/// <summary>
/// Opens the desktop's file manager at a file: Explorer with the file selected on Windows, and on Linux the
/// FileManager1 ShowItems D-Bus call, which selects it, falling back to <c>xdg-open</c> on its folder. Nothing is
/// started through a shell.
/// </summary>
internal sealed class DesktopFileManagerLauncher : IFileManagerLauncher
{
    private const string FileManagerBusName = "org.freedesktop.FileManager1";
    private const string FileManagerObjectPath = "/org/freedesktop/FileManager1";
    private static readonly TimeSpan ShowItemsTimeout = TimeSpan.FromSeconds(5);

    private readonly FileManagerPlatform _platform;
    private readonly Func<string, string?> _getEnvironmentVariable;
    private readonly Action<ProcessStartInfo> _startProcess;
    private readonly Func<string, CancellationToken, Task> _showItems;

    public DesktopFileManagerLauncher(
        FileManagerPlatform platform,
        Func<string, string?> getEnvironmentVariable,
        Action<ProcessStartInfo> startProcess,
        Func<string, CancellationToken, Task> showItems)
    {
        _platform = platform;
        _getEnvironmentVariable = getEnvironmentVariable;
        _startProcess = startProcess;
        _showItems = showItems;
    }

    public static DesktopFileManagerLauncher Create()
    {
        var platform = OperatingSystem.IsWindows()
            ? FileManagerPlatform.Windows
            : OperatingSystem.IsLinux() ? FileManagerPlatform.Linux : FileManagerPlatform.Other;
        return new DesktopFileManagerLauncher(
            platform,
            Environment.GetEnvironmentVariable,
            startInfo => Process.Start(startInfo)?.Dispose(),
            CallShowItemsAsync);
    }

    // A session bus alone doesn't mean a desktop: an SSH login has one too.
    public bool IsAvailable => _platform switch
    {
        FileManagerPlatform.Windows => true,
        FileManagerPlatform.Linux => HasValue("DISPLAY") || HasValue("WAYLAND_DISPLAY"),
        _ => false
    };

    public async Task<FileManagerShowResult> ShowAsync(string fullPath, CancellationToken cancellationToken)
    {
        if (_platform == FileManagerPlatform.Windows)
        {
            return StartProcess(ExplorerStartInfo(fullPath), FileManagerShowResult.ShownWithExplorer);
        }

        if (HasValue("DBUS_SESSION_BUS_ADDRESS"))
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(ShowItemsTimeout);
                await _showItems(FileUri(fullPath), timeout.Token).WaitAsync(timeout.Token);
                return FileManagerShowResult.Succeeded(FileManagerShowResult.ShownWithDbus);
            }
            catch (Exception)
            {
                // No FileManager1 service, an error reply, or no answer in time: open the folder instead.
            }
        }

        return StartProcess(XdgOpenStartInfo(fullPath), FileManagerShowResult.ShownWithXdgOpen);
    }

    /// <summary>
    /// A <c>file://</c> URI with every path segment percent-encoded. <see cref="Uri.AbsoluteUri"/> would decode a
    /// <c>%XX</c> in a file name and leave some reserved characters bare.
    /// </summary>
    internal static string FileUri(string fullPath)
    {
        return "file://" + string.Join("/", fullPath.Split('/').Select(Uri.EscapeDataString));
    }

    private static ProcessStartInfo ExplorerStartInfo(string fullPath)
    {
        return new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe"),
            // ArgumentList would quote the whole /select token, and Explorer needs /select,"<path>". A Windows path
            // can't contain a quote, so nothing can break out of it.
            Arguments = "/select,\"" + fullPath + "\"",
            UseShellExecute = false
        };
    }

    // The folder comes from the last '/', since Path APIs would turn the separators into '\' on Windows.
    private static ProcessStartInfo XdgOpenStartInfo(string fullPath)
    {
        var lastSlash = fullPath.LastIndexOf('/');
        var folder = lastSlash > 0 ? fullPath[..lastSlash] : "/";
        var startInfo = new ProcessStartInfo
        {
            FileName = "xdg-open",
            UseShellExecute = false
        };
        startInfo.ArgumentList.Add(folder);
        return startInfo;
    }

    // Not waited on: the file manager keeps running, and Explorer often exits with 1 even when it worked.
    private FileManagerShowResult StartProcess(ProcessStartInfo startInfo, string shownWith)
    {
        try
        {
            _startProcess(startInfo);
            return FileManagerShowResult.Succeeded(shownWith);
        }
        catch (Exception ex)
        {
            return FileManagerShowResult.Failed(ex);
        }
    }

    private bool HasValue(string name)
    {
        return !string.IsNullOrWhiteSpace(_getEnvironmentVariable(name));
    }

    // Its own connection rather than the shared session connection, which the tray may hold.
    private static async Task CallShowItemsAsync(string uri, CancellationToken cancellationToken)
    {
        using var connection = new DBusConnection(DBusAddress.Session!);
        await connection.ConnectAsync().AsTask().WaitAsync(cancellationToken);
        MessageBuffer message;
        using (var writer = connection.GetMessageWriter())
        {
            writer.WriteMethodCallHeader(
                destination: FileManagerBusName,
                path: FileManagerObjectPath,
                @interface: FileManagerBusName,
                member: "ShowItems",
                signature: "ass",
                flags: MessageFlags.None);
            writer.WriteArray(new[] { uri });
            writer.WriteString("");
            message = writer.CreateMessage();
        }

        await connection.CallMethodAsync(message).WaitAsync(cancellationToken);
    }
}
