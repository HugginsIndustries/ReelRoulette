using System.Runtime.CompilerServices;
using ReelRoulette;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// Keeps every desktop test away from the developer's settings and running server.
/// Runs when the test assembly loads, before any test.
/// </summary>
internal static class TestIsolation
{
    public static string AppDataDirectory { get; } =
        Path.Combine(Path.GetTempPath(), "reelroulette-desktop-tests", Guid.NewGuid().ToString("N"));

    [ModuleInitializer]
    internal static void Initialize()
    {
        AppDataManager.UseDirectoryForTests(AppDataDirectory);
        ClientLogRelay.DisableForTests();
        AppDomain.CurrentDomain.ProcessExit += (_, _) =>
        {
            try
            {
                Directory.Delete(AppDataDirectory, recursive: true);
            }
            catch
            {
                // Best effort; the directory lives under the temp folder.
            }
        };
    }
}
