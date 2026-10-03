namespace ReelRoulette.Server.Services;

/// <summary>
/// Resolves the server data and thumbnail folders. Setting <see cref="DataDirectoryVariable"/> moves
/// both under one folder, so verification scripts and tests can isolate the server on every OS.
/// </summary>
public static class ServerDataPaths
{
    public const string DataDirectoryVariable = "REELROULETTE_DATA_DIR";

    public static string DataDirectory() => ResolveDataDirectory(ReadOverride());

    public static string ThumbnailDirectory() => ResolveThumbnailDirectory(ReadOverride());

    internal static string ResolveDataDirectory(string? overrideDirectory)
    {
        if (!string.IsNullOrWhiteSpace(overrideDirectory))
        {
            return Path.GetFullPath(overrideDirectory.Trim());
        }

        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
    }

    internal static string ResolveThumbnailDirectory(string? overrideDirectory)
    {
        if (!string.IsNullOrWhiteSpace(overrideDirectory))
        {
            return Path.Combine(Path.GetFullPath(overrideDirectory.Trim()), "thumbnails");
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ReelRoulette",
            "thumbnails");
    }

    private static string? ReadOverride() => Environment.GetEnvironmentVariable(DataDirectoryVariable);
}
