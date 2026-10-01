using ReelRoulette.Core.Abstractions;

namespace ReelRoulette.Core.Storage;

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
