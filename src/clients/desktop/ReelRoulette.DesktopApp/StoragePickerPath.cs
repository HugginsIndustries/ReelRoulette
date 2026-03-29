using System;
using Avalonia.Platform.Storage;

namespace ReelRoulette;

/// <summary>
/// Resolves filesystem paths from <see cref="IStorageItem"/> values returned by Avalonia storage pickers.
/// Under xdg-desktop-portal (and similar), <see cref="IStorageItem.Path"/>.<see cref="Uri.LocalPath"/> is often empty;
/// <see cref="StorageProviderExtensions.TryGetLocalPath"/> supplies the real path when the backend exposes it.
/// </summary>
internal static class StoragePickerPath
{
    public static bool TryGetLocalFilesystemPath(IStorageItem? item, out string? path)
    {
        path = null;
        if (item == null)
        {
            return false;
        }

        var fromApi = StorageProviderExtensions.TryGetLocalPath(item);
        if (!string.IsNullOrWhiteSpace(fromApi))
        {
            path = fromApi.Trim();
            return true;
        }

        var uri = item.Path;
        var local = uri.LocalPath;
        if (!string.IsNullOrWhiteSpace(local))
        {
            path = local.Trim();
            return true;
        }

        if (uri.IsAbsoluteUri && uri.IsFile)
        {
            var decoded = Uri.UnescapeDataString(uri.LocalPath);
            if (!string.IsNullOrWhiteSpace(decoded))
            {
                path = decoded.Trim();
                return true;
            }
        }

        return false;
    }
}
