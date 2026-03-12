using Microsoft.Win32;

namespace ReelRoulette.ServerApp.Hosting;

internal sealed class WindowsStartupLaunchService : IStartupLaunchService
{
    private const string RunSubKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "ReelRoulette.ServerApp";
    private readonly ILogger<WindowsStartupLaunchService> _logger;

    public WindowsStartupLaunchService(ILogger<WindowsStartupLaunchService> logger)
    {
        _logger = logger;
    }

    public Task<StartupLaunchStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        try
        {
            var executablePath = Environment.ProcessPath;
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

            using var runKey = Registry.CurrentUser.OpenSubKey(RunSubKeyPath, writable: false);
            var raw = runKey?.GetValue(RunValueName)?.ToString();
            var expected = QuoteExecutable(executablePath);
            var enabled = string.Equals(raw?.Trim(), expected, StringComparison.OrdinalIgnoreCase);
            return Task.FromResult(new StartupLaunchStatus(
                Supported: true,
                LaunchServerOnStartup: enabled,
                Message: enabled
                    ? "Launch Server on Startup is enabled."
                    : "Launch Server on Startup is disabled."));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read Windows startup registration.");
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
            var executablePath = Environment.ProcessPath;
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

            using var runKey = Registry.CurrentUser.OpenSubKey(RunSubKeyPath, writable: true) ??
                               Registry.CurrentUser.CreateSubKey(RunSubKeyPath, writable: true);
            if (runKey is null)
            {
                return Task.FromResult(new StartupLaunchResult(
                    Accepted: false,
                    Supported: true,
                    LaunchServerOnStartup: false,
                    Message: "Unable to open Windows startup registry key."));
            }

            if (enabled)
            {
                runKey.SetValue(RunValueName, QuoteExecutable(executablePath), RegistryValueKind.String);
                _logger.LogInformation("Launch Server on Startup enabled ({Reason}).", reason);
                return Task.FromResult(new StartupLaunchResult(
                    Accepted: true,
                    Supported: true,
                    LaunchServerOnStartup: true,
                    Message: "Launch Server on Startup enabled."));
            }

            runKey.DeleteValue(RunValueName, throwOnMissingValue: false);
            _logger.LogInformation("Launch Server on Startup disabled ({Reason}).", reason);
            return Task.FromResult(new StartupLaunchResult(
                Accepted: true,
                Supported: true,
                LaunchServerOnStartup: false,
                Message: "Launch Server on Startup disabled."));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to update Windows startup registration ({Reason}).", reason);
            return Task.FromResult(new StartupLaunchResult(
                Accepted: false,
                Supported: true,
                LaunchServerOnStartup: false,
                Message: "Failed to update startup registration."));
        }
    }

    private static string QuoteExecutable(string executablePath)
    {
        return $"\"{executablePath}\"";
    }

    private static bool IsDotnetHostExecutable(string processPath)
    {
        var name = Path.GetFileNameWithoutExtension(processPath);
        return string.Equals(name, "dotnet", StringComparison.OrdinalIgnoreCase);
    }
}
