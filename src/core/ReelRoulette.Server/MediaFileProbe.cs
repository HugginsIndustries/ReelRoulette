namespace ReelRoulette.Server;

public enum MediaFileState
{
    Readable,
    Missing,
    Unreadable
}

/// <summary>
/// Whether a media file can be served, decided by opening it. <see cref="File.Exists(string)"/> answers false on any
/// I/O error, so a file on a stalled drive or share would look missing; the exception from the open tells the two
/// apart.
/// </summary>
public static class MediaFileProbe
{
    /// <summary>
    /// Opens the file for reading and closes it at once. A missing file or folder is <see cref="MediaFileState.Missing"/>;
    /// any other I/O or access error is <see cref="MediaFileState.Unreadable"/>, with the error in
    /// <paramref name="error"/>.
    /// </summary>
    public static MediaFileState Probe(string fullPath, out Exception? error)
    {
        error = null;
        try
        {
            using var stream = new FileStream(
                fullPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete);
            return MediaFileState.Readable;
        }
        catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException)
        {
            error = ex;
            return MediaFileState.Missing;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            error = ex;
            return MediaFileState.Unreadable;
        }
    }
}
