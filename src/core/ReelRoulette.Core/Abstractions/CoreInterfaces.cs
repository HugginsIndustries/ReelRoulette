using System.Threading;

namespace ReelRoulette.Core.Abstractions;

public interface IStorageService<T>
{
    T Load();
    void Save(T value);
}

public interface IAtomicUpdateStorageService<T> : IStorageService<T>
{
    T Update(Func<T, T> update);
}

public interface IPathResolver
{
    string GetPath();
}

public interface IBackgroundTaskScheduler
{
    void Queue(string taskName, Action<CancellationToken> work, CancellationToken cancellationToken = default);
}
