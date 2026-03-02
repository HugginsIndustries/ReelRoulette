using System.Threading;

namespace ReelRoulette.Core.Abstractions;

public interface IStorageService<T>
{
    T Load();
    void Save(T value);
}

public interface IBackgroundTaskScheduler
{
    void Queue(string taskName, Action<CancellationToken> work, CancellationToken cancellationToken = default);
}
