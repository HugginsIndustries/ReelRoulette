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
