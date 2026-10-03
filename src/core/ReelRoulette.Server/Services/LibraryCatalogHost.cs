using ReelRoulette.Core.Library;

namespace ReelRoulette.Server.Services;

public sealed class LibraryCatalogHost
{
    private readonly LibraryCatalogSession _session;

    private LibraryCatalogHost(LibraryCatalogSession session)
    {
        _session = session;
    }

    public LibraryCatalogSession Session => _session;

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
        if (result.Status != LibraryCatalogOpenStatus.Opened || result.Session == null)
        {
            throw new InvalidOperationException(result.Message ?? LibraryCatalogStore.RefusedMessage);
        }

        return new LibraryCatalogHost(result.Session);
    }
}
