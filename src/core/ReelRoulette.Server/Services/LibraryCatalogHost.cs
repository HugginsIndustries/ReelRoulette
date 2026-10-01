using ReelRoulette.Core.Library;

namespace ReelRoulette.Server.Services;

public sealed class LibraryCatalogHost
{
    private readonly LibraryCatalogSession _session;

    private LibraryCatalogHost(LibraryCatalogSession session, bool migratedSchema)
    {
        _session = session;
        MigratedSchema = migratedSchema;
    }

    public LibraryCatalogSession Session => _session;

    public bool MigratedSchema { get; }

    public static string LocalThumbnailDirectory(string? appDataPathOverride = null)
    {
        if (!string.IsNullOrWhiteSpace(appDataPathOverride))
        {
            return Path.Combine(appDataPathOverride, "thumbnails");
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ReelRoulette",
            "thumbnails");
    }

    public static LibraryCatalogHost Open(string directory, string? thumbnailDirectory = null)
    {
        var result = LibraryCatalogStore.Open(
            directory,
            thumbnailDirectory == null
                ? null
                : new LibraryCatalogOpenOptions { ThumbnailDirectory = thumbnailDirectory });
        if (result.Status != LibraryCatalogOpenStatus.Opened || result.Session == null)
        {
            throw new InvalidOperationException(result.Message ?? LibraryCatalogStore.RefusedMessage);
        }

        return new LibraryCatalogHost(result.Session, result.MigratedSchema);
    }
}
