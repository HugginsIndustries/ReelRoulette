using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Core.Tests;

internal static class CatalogOpen
{
    public static LibraryCatalogOpenResult Open(string directory)
    {
        return LibraryCatalogStore.Open(directory);
    }

    /// <summary>
    /// Opens the catalog in a server data folder, without the catalog backup the server attaches at startup.
    /// </summary>
    public static LibraryCatalogHost Host(string directory)
    {
        return LibraryCatalogHost.Open(directory);
    }

    /// <summary>
    /// Opens the catalog in a server data folder the way the server does at startup, with the catalog backup
    /// attached.
    /// </summary>
    public static LibraryCatalogHost ServerHost(string directory)
    {
        return ServerHostComposition.OpenLibraryCatalog(directory, NullLogger.Instance);
    }

    /// <summary>
    /// Reads the opened catalog, or null when the open was refused.
    /// </summary>
    public static LibraryCatalogSnapshot? Snapshot(this LibraryCatalogOpenResult result)
    {
        return result.Session == null ? null : LibraryCatalogStore.Read(result.Session.DatabasePath);
    }
}
