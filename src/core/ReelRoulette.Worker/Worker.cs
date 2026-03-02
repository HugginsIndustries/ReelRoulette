namespace ReelRoulette.Worker;

public sealed class WorkerLifecycleService : IHostedService
{
    private readonly ILogger<WorkerLifecycleService> _logger;
    private readonly IHostApplicationLifetime _lifetime;

    public WorkerLifecycleService(ILogger<WorkerLifecycleService> logger, IHostApplicationLifetime lifetime)
    {
        _logger = logger;
        _lifetime = lifetime;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Worker lifecycle start requested.");
        _lifetime.ApplicationStopping.Register(() => _logger.LogInformation("Worker lifecycle stopping."));
        _lifetime.ApplicationStopped.Register(() => _logger.LogInformation("Worker lifecycle stopped."));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Worker lifecycle stop requested.");
        return Task.CompletedTask;
    }
}
