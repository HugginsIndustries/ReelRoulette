using System.Text.Json;
using ReelRoulette.Core.Abstractions;

namespace ReelRoulette.Core.Storage;

public sealed class JsonFileStorageOptions<T>
{
    public required Func<string> FilePathResolver { get; init; }
    public required Func<T> CreateDefault { get; init; }
    public JsonSerializerOptions SerializerOptions { get; init; } = new() { WriteIndented = true };
    public Action<string>? Logger { get; init; }
}

public sealed class JsonFileStorageService<T> : IAtomicUpdateStorageService<T>
{
    private readonly JsonFileStorageOptions<T> _options;
    private readonly object _lock = new();

    public JsonFileStorageService(JsonFileStorageOptions<T> options)
    {
        _options = options;
    }

    public T Load()
    {
        lock (_lock)
        {
            var path = _options.FilePathResolver();
            try
            {
                if (!File.Exists(path))
                {
                    _options.Logger?.Invoke($"JsonFileStorageService<{typeof(T).Name}>: file missing, returning default ({path})");
                    return _options.CreateDefault();
                }

                var json = File.ReadAllText(path);
                var value = JsonSerializer.Deserialize<T>(json, _options.SerializerOptions);
                if (value == null)
                {
                    _options.Logger?.Invoke($"JsonFileStorageService<{typeof(T).Name}>: deserialized null, returning default ({path})");
                    return _options.CreateDefault();
                }

                return value;
            }
            catch (Exception ex)
            {
                _options.Logger?.Invoke($"JsonFileStorageService<{typeof(T).Name}>: load failed ({ex.Message}), returning default");
                return _options.CreateDefault();
            }
        }
    }

    public void Save(T value)
    {
        lock (_lock)
        {
            var path = _options.FilePathResolver();
            var json = JsonSerializer.Serialize(value, _options.SerializerOptions);
            var tempPath = path + ".tmp";

            File.WriteAllText(tempPath, json);
            if (File.Exists(path))
            {
                try
                {
                    File.Replace(tempPath, path, null);
                }
                catch
                {
                    File.Copy(tempPath, path, true);
                    File.Delete(tempPath);
                }
            }
            else
            {
                File.Move(tempPath, path);
            }
        }
    }

    public T Update(Func<T, T> update)
    {
        lock (_lock)
        {
            var current = Load();
            var next = update(current);
            Save(next);
            return next;
        }
    }
}
