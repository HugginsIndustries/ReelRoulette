namespace ReelRoulette.ServerApp.Hosting;

internal sealed class HeadlessHostUi : IHostUi
{
    public void Start()
    {
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }
}
