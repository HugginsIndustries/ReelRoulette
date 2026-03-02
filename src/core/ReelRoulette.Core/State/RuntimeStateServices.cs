using ReelRoulette.Core.Randomization;

namespace ReelRoulette.Core.State;

public sealed class RandomizationStateService
{
    private readonly Dictionary<string, RandomizationRuntimeStateCore> _states = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();

    public RandomizationRuntimeStateCore GetOrCreate(string scopeKey = "desktop")
    {
        lock (_lock)
        {
            if (!_states.TryGetValue(scopeKey, out var state))
            {
                state = new RandomizationRuntimeStateCore();
                _states[scopeKey] = state;
            }

            return state;
        }
    }

    public void Reset(string scopeKey = "desktop")
    {
        lock (_lock)
        {
            _states.Remove(scopeKey);
        }
    }
}

public sealed class FilterSessionState
{
    public object? CurrentFilterState { get; set; }
    public List<object> FilterPresets { get; set; } = new();
    public string? ActivePresetName { get; set; }
}

public sealed class FilterSessionStateService
{
    private readonly object _lock = new();
    private FilterSessionState _state = new();

    public FilterSessionState GetSnapshot()
    {
        lock (_lock)
        {
            return new FilterSessionState
            {
                CurrentFilterState = _state.CurrentFilterState,
                FilterPresets = new List<object>(_state.FilterPresets),
                ActivePresetName = _state.ActivePresetName
            };
        }
    }

    public void Set(object? filterState, IEnumerable<object>? presets, string? activePresetName)
    {
        lock (_lock)
        {
            _state.CurrentFilterState = filterState;
            _state.FilterPresets = presets?.ToList() ?? new List<object>();
            _state.ActivePresetName = activePresetName;
        }
    }
}

public sealed class PlaybackSessionState
{
    public bool LoopEnabled { get; set; } = true;
    public bool AutoPlayNext { get; set; } = true;
    public bool IsMuted { get; set; }
    public int VolumeLevel { get; set; } = 100;
}

public sealed class PlaybackSessionStateService
{
    private readonly object _lock = new();
    private PlaybackSessionState _state = new();

    public PlaybackSessionState GetSnapshot()
    {
        lock (_lock)
        {
            return new PlaybackSessionState
            {
                LoopEnabled = _state.LoopEnabled,
                AutoPlayNext = _state.AutoPlayNext,
                IsMuted = _state.IsMuted,
                VolumeLevel = _state.VolumeLevel
            };
        }
    }

    public void Set(PlaybackSessionState state)
    {
        lock (_lock)
        {
            _state = state;
        }
    }
}
