using ReelRoulette.Core.Library;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Core.Tests;

internal static class CatalogOpen
{
    public static LibraryCatalogOpenResult Open(string directory)
    {
        return LibraryCatalogStore.Open(directory);
    }

    /// <summary>
    /// Opens the catalog in a server data folder the way the server does.
    /// </summary>
    public static LibraryCatalogHost Host(string directory)
    {
        return LibraryCatalogHost.Open(directory);
    }

    /// <summary>
    /// Reads the opened catalog, or null when the open was refused.
    /// </summary>
    public static LibraryCatalogSnapshot? Snapshot(this LibraryCatalogOpenResult result)
    {
        return result.Session == null ? null : LibraryCatalogStore.Read(result.Session.DatabasePath);
    }
}
