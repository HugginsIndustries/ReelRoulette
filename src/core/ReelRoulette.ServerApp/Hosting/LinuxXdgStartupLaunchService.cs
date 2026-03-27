namespace ReelRoulette.ServerApp.Hosting;

internal sealed class LinuxXdgStartupLaunchService : IStartupLaunchService
{
    private const string DesktopEntryFileName = "reelroulette-server.desktop";
    private readonly ILogger<LinuxXdgStartupLaunchService> _logger;

    public LinuxXdgStartupLaunchService(ILogger<LinuxXdgStartupLaunchService> logger)
    {
        _logger = logger;
    }

    public Task<StartupLaunchStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        try
        {
            var executablePath = ResolveExecutablePath();
            if (string.IsNullOrWhiteSpace(executablePath))
            {
                return Task.FromResult(new StartupLaunchStatus(
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Current process path is unavailable."));
            }

            if (IsDotnetHostExecutable(executablePath))
            {
                return Task.FromResult(new StartupLaunchStatus(
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Launch Server on Startup is available only for app-binary runtime."));
            }

            var desktopEntryPath = GetDesktopEntryPath();
            if (!File.Exists(desktopEntryPath))
            {
                return Task.FromResult(new StartupLaunchStatus(
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Launch Server on Startup is disabled."));
            }

            var content = File.ReadAllText(desktopEntryPath);
            var enabled = content.Contains("Hidden=true", StringComparison.OrdinalIgnoreCase) == false;
            return Task.FromResult(new StartupLaunchStatus(
                Supported: true,
                LaunchServerOnStartup: enabled,
                Message: enabled
                    ? "Launch Server on Startup is enabled."
                    : "Launch Server on Startup is disabled."));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read Linux XDG autostart registration.");
            return Task.FromResult(new StartupLaunchStatus(
                Supported: true,
                LaunchServerOnStartup: false,
                Message: "Failed to read startup registration."));
        }
    }

    public Task<StartupLaunchResult> SetEnabledAsync(bool enabled, string reason, CancellationToken cancellationToken)
    {
        try
        {
            var executablePath = ResolveExecutablePath();
            if (string.IsNullOrWhiteSpace(executablePath))
            {
                return Task.FromResult(new StartupLaunchResult(
                    Accepted: false,
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Unable to update startup registration because process path is unavailable."));
            }

            if (IsDotnetHostExecutable(executablePath))
            {
                return Task.FromResult(new StartupLaunchResult(
                    Accepted: false,
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Launch Server on Startup requires app-binary runtime."));
            }

            var desktopEntryPath = GetDesktopEntryPath();
            var autostartDir = Path.GetDirectoryName(desktopEntryPath);
            if (string.IsNullOrWhiteSpace(autostartDir))
            {
                return Task.FromResult(new StartupLaunchResult(
                    Accepted: false,
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Unable to resolve XDG autostart directory."));
            }

            Directory.CreateDirectory(autostartDir);

            if (enabled)
            {
                File.WriteAllText(desktopEntryPath, BuildDesktopEntryContent(executablePath));
                _logger.LogInformation("Launch Server on Startup enabled via XDG autostart ({Reason}).", reason);
                return Task.FromResult(new StartupLaunchResult(
                    Accepted: true,
                    Supported: true,
                    LaunchServerOnStartup: true,
                    Message: "Launch Server on Startup enabled."));
            }

            if (File.Exists(desktopEntryPath))
            {
                File.Delete(desktopEntryPath);
            }

            _logger.LogInformation("Launch Server on Startup disabled via XDG autostart ({Reason}).", reason);
            return Task.FromResult(new StartupLaunchResult(
                Accepted: true,
                Supported: true,
                LaunchServerOnStartup: false,
                Message: "Launch Server on Startup disabled."));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to update Linux XDG autostart registration ({Reason}).", reason);
            return Task.FromResult(new StartupLaunchResult(
                Accepted: false,
                Supported: true,
                LaunchServerOnStartup: false,
                Message: "Failed to update startup registration."));
        }
    }

    private static string BuildDesktopEntryContent(string executablePath)
    {
        return string.Join(
            Environment.NewLine,
            [
                "[Desktop Entry]",
                "Type=Application",
                "Version=1.0",
                "Name=ReelRoulette Server",
                $"Exec=\"{executablePath}\"",
                "Terminal=false",
                "X-GNOME-Autostart-enabled=true",
                "Comment=ReelRoulette Server"
            ]) + Environment.NewLine;
    }

    private static string ResolveExecutablePath()
    {
        return Environment.ProcessPath ?? string.Empty;
    }

    private static string GetDesktopEntryPath()
    {
        var xdgConfigHome = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        var configRoot = string.IsNullOrWhiteSpace(xdgConfigHome)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config")
            : xdgConfigHome;
        return Path.Combine(configRoot, "autostart", DesktopEntryFileName);
    }

    private static bool IsDotnetHostExecutable(string processPath)
    {
        var name = Path.GetFileNameWithoutExtension(processPath);
        return string.Equals(name, "dotnet", StringComparison.OrdinalIgnoreCase);
    }
}
