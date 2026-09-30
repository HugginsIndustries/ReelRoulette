using ReelRoulette.Core.Library;

namespace ReelRoulette.Core.Tests;

internal static class CatalogOpen
{
    public static LibraryCatalogOpenResult Open(string directory, LibraryCatalogOpenOptions? options = null)
    {
        return LibraryCatalogStore.Open(directory, WithThumbnailDirectory(directory, options));
    }

    public static LibraryCatalogOpenOptions WithThumbnailDirectory(string directory, LibraryCatalogOpenOptions? options)
    {
        if (!string.IsNullOrWhiteSpace(options?.ThumbnailDirectory))
        {
            return options!;
        }

        return new LibraryCatalogOpenOptions
        {
            BeforePublish = options?.BeforePublish,
            DirectorySync = options?.DirectorySync,
            AfterSideFileCopy = options?.AfterSideFileCopy,
            ThumbnailDirectory = Path.Combine(directory, "thumbnails")
        };
    }
}
