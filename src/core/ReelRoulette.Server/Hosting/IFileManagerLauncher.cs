namespace ReelRoulette.Server.Hosting;

/// <summary>
/// Optional ServerApp hook: open the system file manager on the server machine at a file. A server without one
/// registered can't open a file manager.
/// </summary>
public interface IFileManagerLauncher
{
    /// <summary>Whether this server has a desktop session it can open a file manager in.</summary>
    bool IsAvailable { get; }

    /// <summary>Asks the file manager to show the file, selected where it can. Ordinary failures come back in the result.</summary>
    Task<FileManagerShowResult> ShowAsync(string fullPath, CancellationToken cancellationToken);
}

/// <summary>
/// Whether the file manager was asked to show the file, and how: <c>dbus</c>, <c>xdg-open</c>, or <c>explorer</c>.
/// On failure, the type name of the error that stopped it.
/// </summary>
public sealed record FileManagerShowResult(bool Shown, string? ShownWith, string? ErrorType)
{
    public const string ShownWithDbus = "dbus";
    public const string ShownWithXdgOpen = "xdg-open";
    public const string ShownWithExplorer = "explorer";

    public static FileManagerShowResult Succeeded(string shownWith) => new(true, shownWith, null);

    public static FileManagerShowResult Failed(Exception error) => new(false, null, error.GetType().Name);
}
