using System.Runtime.CompilerServices;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// Keeps every core and server test away from the developer's data folders.
/// Runs when the test assembly loads, before any test.
/// </summary>
internal static class TestIsolation
{
    public static string RootDirectory { get; } =
        Path.Combine(Path.GetTempPath(), "reelroulette-core-tests", Guid.NewGuid().ToString("N"));

    /// <summary>Server data folder for code that falls back to <see cref="ServerDataPaths"/>.</summary>
    public static string DataDirectory { get; } = Path.Combine(RootDirectory, "data");

    /// <summary>
    /// Where Linux <c>ApplicationData</c> and <c>LocalApplicationData</c> point during tests.
    /// Server code should never write here; a ReelRoulette folder in it means a lookup bypassed the override.
    /// </summary>
    public static string XdgDirectory { get; } = Path.Combine(RootDirectory, "xdg");

    public static string XdgConfigHome => Path.Combine(XdgDirectory, "config");

    public static string XdgDataHome => Path.Combine(XdgDirectory, "data");

    [ModuleInitializer]
    internal static void Initialize()
    {
        Environment.SetEnvironmentVariable(ServerDataPaths.DataDirectoryVariable, DataDirectory);
        if (OperatingSystem.IsLinux())
        {
            // GetFolderPath returns an empty path for an XDG folder that does not exist yet.
            Directory.CreateDirectory(XdgConfigHome);
            Directory.CreateDirectory(XdgDataHome);
            Environment.SetEnvironmentVariable("XDG_CONFIG_HOME", XdgConfigHome);
            Environment.SetEnvironmentVariable("XDG_DATA_HOME", XdgDataHome);
        }

        AppDomain.CurrentDomain.ProcessExit += (_, _) =>
        {
            try
            {
                Directory.Delete(RootDirectory, recursive: true);
            }
            catch
            {
                // Best effort; the directory lives under the temp folder.
            }
        };
    }
}
