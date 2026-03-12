namespace ReelRoulette.ServerApp.Hosting;

internal sealed class HeadlessStartupLaunchService : IStartupLaunchService
{
    private const string UnsupportedMessage = "Launch Server on Startup is not supported on this platform.";

    public Task<StartupLaunchStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(new StartupLaunchStatus(
            Supported: false,
            LaunchServerOnStartup: false,
            Message: UnsupportedMessage));
    }

    public Task<StartupLaunchResult> SetEnabledAsync(bool enabled, string reason, CancellationToken cancellationToken)
    {
        return Task.FromResult(new StartupLaunchResult(
            Accepted: false,
            Supported: false,
            LaunchServerOnStartup: false,
            Message: UnsupportedMessage));
    }
}
