using System;
using System.Collections.Generic;

namespace ReelRoulette;

/// <summary>
/// Reads desktop uses instead of the full catalog. Connect and resync use <see cref="SessionPaths"/>.
/// </summary>
public static class LibraryConnectReads
{
    public static IReadOnlyList<string> SessionPaths { get; } =
    [
        CoreServerApiClient.LibraryStatsPath,
        CoreServerApiClient.LibrarySourcesPath,
        CoreServerApiClient.LibraryTagCatalogPath
    ];

    public static string ItemPath => CoreServerApiClient.LibraryItemPath;

    public static bool IsFullCatalogPath(string? path)
    {
        return !string.IsNullOrWhiteSpace(path) &&
               path.Contains("library/projection", StringComparison.OrdinalIgnoreCase);
    }
}
