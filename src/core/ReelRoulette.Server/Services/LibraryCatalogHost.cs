using ReelRoulette.Core.Library;

namespace ReelRoulette.Server.Services;

/// <summary>
/// The server's catalog. When the catalog cannot be used, because a newer build wrote it, it was
/// refused, only backups are left, or a catalog file could not be read, the server runs without a
/// library and this says why.
/// </summary>
public sealed class LibraryCatalogHost
{
    private readonly LibraryCatalogSession? _session;

    private LibraryCatalogHost(LibraryCatalogSession? session, LibraryCatalogOpenStatus status, string? unavailableMessage)
    {
        _session = session;
        Status = status;
        UnavailableMessage = unavailableMessage;
    }

    /// <summary>The open catalog. Without a library this throws with <see cref="UnavailableMessage"/>.</summary>
    public LibraryCatalogSession Session =>
        _session ?? throw new InvalidOperationException(UnavailableMessage);

    public LibraryCatalogOpenStatus Status { get; }

    /// <summary>Why there is no library, or null when there is one.</summary>
    public string? UnavailableMessage { get; }

    public bool HasLibrary => _session != null;

    /// <summary>The library state as the control status reports it.</summary>
    public string StateName => Status switch
    {
        LibraryCatalogOpenStatus.Opened => "ready",
        LibraryCatalogOpenStatus.Newer => "newer",
        LibraryCatalogOpenStatus.Missing => "missing",
        LibraryCatalogOpenStatus.Unreadable => "unreadable",
        _ => "damaged"
    };

    /// <summary>The error code of a library route refused without a library.</summary>
    public string? UnavailableCode => HasLibrary ? null : "library_" + StateName;

    public static string LocalThumbnailDirectory(string? appDataPathOverride = null)
    {
        if (!string.IsNullOrWhiteSpace(appDataPathOverride))
        {
            return Path.Combine(appDataPathOverride, "thumbnails");
        }

        return ServerDataPaths.ThumbnailDirectory();
    }

    public static LibraryCatalogHost Open(string directory)
    {
        var result = LibraryCatalogStore.Open(directory);
        if (result.Status == LibraryCatalogOpenStatus.Opened && result.Session != null)
        {
            return new LibraryCatalogHost(result.Session, result.Status, null);
        }

        return new LibraryCatalogHost(null, result.Status, result.Message ?? LibraryCatalogStore.RefusedMessage);
    }
}
