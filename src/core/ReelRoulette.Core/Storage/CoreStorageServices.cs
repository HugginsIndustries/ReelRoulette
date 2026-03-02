using ReelRoulette.Core.Abstractions;

namespace ReelRoulette.Core.Storage;

public sealed class LibraryIndexStorageService<TLibraryIndex> : IAtomicUpdateStorageService<TLibraryIndex>
{
    private readonly JsonFileStorageService<TLibraryIndex> _inner;

    public LibraryIndexStorageService(JsonFileStorageOptions<TLibraryIndex> options)
    {
        _inner = new JsonFileStorageService<TLibraryIndex>(options);
    }

    public TLibraryIndex Load() => _inner.Load();

    public void Save(TLibraryIndex value) => _inner.Save(value);

    public TLibraryIndex Update(Func<TLibraryIndex, TLibraryIndex> update) => _inner.Update(update);
}

public sealed class SettingsStorageService<TSettings> : IAtomicUpdateStorageService<TSettings>
{
    private readonly JsonFileStorageService<TSettings> _inner;

    public SettingsStorageService(JsonFileStorageOptions<TSettings> options)
    {
        _inner = new JsonFileStorageService<TSettings>(options);
    }

    public TSettings Load() => _inner.Load();

    public void Save(TSettings value) => _inner.Save(value);

    public TSettings Update(Func<TSettings, TSettings> update) => _inner.Update(update);
}
