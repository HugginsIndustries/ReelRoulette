using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

public sealed record LibraryUnavailableResponse(string Error, string Code);

/// <summary>
/// Without a library, every <c>/api</c> route answers 503 with the reason, except the ones that work
/// without one. Events, sources, and presets are refused too: without a catalog they would answer
/// with empty data and keep preset edits only in memory.
/// </summary>
public static class LibraryRouteGate
{
    private static readonly PathString[] RoutesWithoutLibrary =
    [
        "/api/version",
        "/api/capabilities",
        "/api/pair",
        "/api/web-runtime/settings",
        "/api/backup/settings",
        "/api/refresh/settings",
        "/api/logs/client"
    ];

    public static LibraryUnavailableResponse? Refusal(PathString path, LibraryCatalogHost catalog)
    {
        if (catalog.HasLibrary || !path.StartsWithSegments("/api"))
        {
            return null;
        }

        foreach (var route in RoutesWithoutLibrary)
        {
            if (path.StartsWithSegments(route))
            {
                return null;
            }
        }

        return new LibraryUnavailableResponse(catalog.UnavailableMessage!, catalog.UnavailableCode!);
    }
}
