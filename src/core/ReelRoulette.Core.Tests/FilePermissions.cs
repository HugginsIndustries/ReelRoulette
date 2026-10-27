namespace ReelRoulette.Core.Tests;

internal static class FilePermissions
{
    /// <summary>
    /// True when the tests run as root on Linux or macOS, such as in a container: root opens, writes, and deletes
    /// files whatever their permissions say, so a test that relies on a permission failing can't check anything.
    /// False on Windows, where an administrator still meets the read-only attribute.
    /// </summary>
    public static bool AreIgnored => !OperatingSystem.IsWindows() && Environment.IsPrivilegedProcess;
}
