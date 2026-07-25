namespace ReelRoulette.Server.Hosting;

/// <summary>
/// Optional ServerApp hook: run an update check promptly when the dev/stable channel toggle changes.
/// </summary>
public interface IServerUpdateChannelCoordinator
{
    void NotifyDevChannelChanged();
}
