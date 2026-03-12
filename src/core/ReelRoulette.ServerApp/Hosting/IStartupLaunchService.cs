namespace ReelRoulette.ServerApp.Hosting;

internal interface IStartupLaunchService
{
    Task<StartupLaunchStatus> GetStatusAsync(CancellationToken cancellationToken);
    Task<StartupLaunchResult> SetEnabledAsync(bool enabled, string reason, CancellationToken cancellationToken);
}

internal sealed record StartupLaunchStatus(
    bool Supported,
    bool LaunchServerOnStartup,
    string Message);

internal sealed record StartupLaunchResult(
    bool Accepted,
    bool Supported,
    bool LaunchServerOnStartup,
    string Message);
