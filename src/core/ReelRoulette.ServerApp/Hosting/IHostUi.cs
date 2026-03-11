namespace ReelRoulette.ServerApp.Hosting;

internal interface IHostUi : IAsyncDisposable
{
    void Start();

    Task StopAsync(CancellationToken cancellationToken);
}
