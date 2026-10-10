using System.Diagnostics;
using System.Security.Cryptography;

namespace ReelRoulette.ServerApp.Hosting;

internal static class LinuxAppImageRegistrationService
{
    private const string AppImageEnvironmentVariable = "APPIMAGE";
    private const string DesktopEntryFileName = "reelroulette-server.desktop";
    private const string IconStem = "reelroulette-server";
    private const string ApplicationName = "ReelRoulette Server";
    private const string ApplicationComment = "ReelRoulette media server";
    private const string Categories = "AudioVideo;Video;";
    private const string Icon256FileName = "icon-256.png";
    private const string IconSvgFileName = "logo-icon.svg";

    public static void TryRegisterInBackground(ILogger? logger = null)
    {
        if (!ShouldRegister())
        {
            return;
        }

        _ = Task.Run(() =>
        {
            try
            {
                RegisterCore(logger);
            }
            catch (Exception ex)
            {
                logger?.LogDebug(ex, "Linux AppImage menu registration failed (non-fatal).");
            }
        });
    }

    private static bool ShouldRegister()
    {
        if (!OperatingSystem.IsLinux())
        {
            return false;
        }

        var appImage = Environment.GetEnvironmentVariable(AppImageEnvironmentVariable);
        return !string.IsNullOrWhiteSpace(appImage);
    }

    private static void RegisterCore(ILogger? logger)
    {
        var appImagePath = ResolveAppImagePath();
        if (string.IsNullOrWhiteSpace(appImagePath))
        {
            return;
        }

        var dataHome = ResolveXdgDataHome();
        var changes = ReconcileRegistration(appImagePath, AppContext.BaseDirectory, dataHome, logger);

        if (changes.AnyChanged)
        {
            logger?.LogInformation(
                "Linux AppImage menu registration updated (desktop={DesktopChanged}, icon256={Icon256Changed}, iconSvg={IconSvgChanged}, legacyIcon512Removed={LegacyIcon512Removed}).",
                changes.DesktopChanged,
                changes.Icon256Changed,
                changes.IconSvgChanged,
                changes.LegacyIcon512Removed);
            NotifyDesktopEnvironment(dataHome, logger);
        }
    }

    internal static RegistrationChanges ReconcileRegistration(
        string appImagePath,
        string sourceDirectory,
        string dataHome,
        ILogger? logger = null)
    {
        var icon256Source = Path.Combine(sourceDirectory, Icon256FileName);
        var iconSvgSource = Path.Combine(sourceDirectory, IconSvgFileName);
        if (!File.Exists(icon256Source) || !File.Exists(iconSvgSource))
        {
            logger?.LogDebug(
                "Skipping Linux menu registration: missing {Icon256} or {IconSvg} under {BaseDirectory}.",
                Icon256FileName,
                IconSvgFileName,
                sourceDirectory);
            return default;
        }

        var applicationsDir = Path.Combine(dataHome, "applications");
        var desktopEntryPath = Path.Combine(applicationsDir, DesktopEntryFileName);
        var hicolorDir = Path.Combine(dataHome, "icons", "hicolor");
        var icon256Dest = Path.Combine(hicolorDir, "256x256", "apps", $"{IconStem}.png");
        var iconSvgDest = Path.Combine(hicolorDir, "scalable", "apps", $"{IconStem}.svg");
        // Earlier versions installed a 512 px icon; a desktop environment may prefer it to the scalable one, so remove it.
        var legacyIcon512Dest = Path.Combine(hicolorDir, "512x512", "apps", $"{IconStem}.png");

        var desiredDesktop = BuildDesktopEntryContent(appImagePath);
        // Install hicolor icons before writing the .desktop entry so a partial run never leaves a menu item without its icon files.
        var icon256Changed = ReconcileBinaryFile(icon256Dest, icon256Source);
        var iconSvgChanged = ReconcileBinaryFile(iconSvgDest, iconSvgSource);
        var legacyIcon512Removed = DeleteIfExists(legacyIcon512Dest);
        var desktopChanged = ReconcileTextFile(desktopEntryPath, desiredDesktop);

        return new RegistrationChanges(desktopChanged, icon256Changed, iconSvgChanged, legacyIcon512Removed);
    }

    private static string ResolveAppImagePath()
    {
        var appImage = Environment.GetEnvironmentVariable(AppImageEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(appImage))
        {
            return string.Empty;
        }

        try
        {
            var full = Path.GetFullPath(appImage.Trim());
            return File.Exists(full) ? full : string.Empty;
        }
        catch (ArgumentException)
        {
            return string.Empty;
        }
    }

    private static string ResolveXdgDataHome()
    {
        var xdgDataHome = Environment.GetEnvironmentVariable("XDG_DATA_HOME");
        if (!string.IsNullOrWhiteSpace(xdgDataHome))
        {
            return xdgDataHome;
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".local",
            "share");
    }

    private static string BuildDesktopEntryContent(string appImagePath)
    {
        var lines = new[]
        {
            "[Desktop Entry]",
            "Type=Application",
            $"Name={ApplicationName}",
            $"Comment={ApplicationComment}",
            $"Exec=\"{appImagePath}\"",
            $"Icon={IconStem}",
            "Terminal=false",
            $"Categories={Categories}"
        };

        return string.Join('\n', lines) + '\n';
    }

    private static bool ReconcileTextFile(string path, string desiredContent)
    {
        var normalizedDesired = NormalizeTextContent(desiredContent);
        if (File.Exists(path))
        {
            var existing = File.ReadAllText(path);
            if (string.Equals(NormalizeTextContent(existing), normalizedDesired, StringComparison.Ordinal))
            {
                return false;
            }
        }

        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(path, normalizedDesired);
        return true;
    }

    private static bool ReconcileBinaryFile(string destPath, string sourcePath)
    {
        if (File.Exists(destPath) && FilesHaveSameContent(destPath, sourcePath))
        {
            return false;
        }

        var directory = Path.GetDirectoryName(destPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.Copy(sourcePath, destPath, overwrite: true);
        return true;
    }

    private static bool DeleteIfExists(string path)
    {
        if (!File.Exists(path))
        {
            return false;
        }

        File.Delete(path);
        return true;
    }

    private static string NormalizeTextContent(string content)
    {
        var normalized = content.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');
        return normalized.TrimEnd('\n') + '\n';
    }

    private static bool FilesHaveSameContent(string pathA, string pathB)
    {
        var hashA = SHA256.HashData(File.ReadAllBytes(pathA));
        var hashB = SHA256.HashData(File.ReadAllBytes(pathB));
        return hashA.AsSpan().SequenceEqual(hashB);
    }

    private static void NotifyDesktopEnvironment(string dataHome, ILogger? logger)
    {
        TryRunHelper("update-desktop-database", Path.Combine(dataHome, "applications"), logger);
        TryRunHelper("gtk-update-icon-cache", "-f", "-t", Path.Combine(dataHome, "icons", "hicolor"), logger);
    }

    private static void TryRunHelper(string fileName, string arg1, ILogger? logger)
    {
        TryRunHelper(fileName, new[] { arg1 }, logger);
    }

    private static void TryRunHelper(string fileName, string arg1, string arg2, string arg3, ILogger? logger)
    {
        TryRunHelper(fileName, new[] { arg1, arg2, arg3 }, logger);
    }

    private static void TryRunHelper(string fileName, IReadOnlyList<string> args, ILogger? logger)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            foreach (var arg in args)
            {
                startInfo.ArgumentList.Add(arg);
            }

            using var process = Process.Start(startInfo);
            process?.WaitForExit(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex)
        {
            logger?.LogDebug(ex, "Optional desktop helper {Helper} failed or is unavailable (non-fatal).", fileName);
        }
    }

    internal readonly record struct RegistrationChanges(
        bool DesktopChanged,
        bool Icon256Changed,
        bool IconSvgChanged,
        bool LegacyIcon512Removed)
    {
        public bool AnyChanged => DesktopChanged || Icon256Changed || IconSvgChanged || LegacyIcon512Removed;
    }
}
