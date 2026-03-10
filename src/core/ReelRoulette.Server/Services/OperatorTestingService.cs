using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class OperatorTestingService
{
    private readonly object _lock = new();
    private OperatorTestingStateSnapshot _state = new();

    public OperatorTestingStateSnapshot GetSnapshot()
    {
        lock (_lock)
        {
            return Clone(_state);
        }
    }

    public OperatorTestingStateSnapshot Apply(OperatorTestingUpdateRequest request)
    {
        lock (_lock)
        {
            if (request.TestingModeEnabled.HasValue)
            {
                _state.TestingModeEnabled = request.TestingModeEnabled.Value;
            }

            if (request.ForceApiVersionMismatch.HasValue)
            {
                _state.ForceApiVersionMismatch = request.ForceApiVersionMismatch.Value;
            }

            if (request.ForceCapabilityMismatch.HasValue)
            {
                _state.ForceCapabilityMismatch = request.ForceCapabilityMismatch.Value;
            }

            if (request.ForceApiUnavailable.HasValue)
            {
                _state.ForceApiUnavailable = request.ForceApiUnavailable.Value;
            }

            if (request.ForceMediaMissing.HasValue)
            {
                _state.ForceMediaMissing = request.ForceMediaMissing.Value;
            }

            if (request.ForceSseDisconnect.HasValue)
            {
                _state.ForceSseDisconnect = request.ForceSseDisconnect.Value;
            }

            if (!_state.TestingModeEnabled)
            {
                // Safety default: disabling Testing Mode clears all fault injections.
                _state.ForceApiVersionMismatch = false;
                _state.ForceCapabilityMismatch = false;
                _state.ForceApiUnavailable = false;
                _state.ForceMediaMissing = false;
                _state.ForceSseDisconnect = false;
            }

            _state.LastUpdatedUtc = DateTimeOffset.UtcNow;
            return Clone(_state);
        }
    }

    public OperatorTestingStateSnapshot Reset()
    {
        lock (_lock)
        {
            _state = new OperatorTestingStateSnapshot
            {
                TestingModeEnabled = _state.TestingModeEnabled,
                LastUpdatedUtc = DateTimeOffset.UtcNow
            };
            return Clone(_state);
        }
    }

    private static OperatorTestingStateSnapshot Clone(OperatorTestingStateSnapshot source)
    {
        return new OperatorTestingStateSnapshot
        {
            TestingModeEnabled = source.TestingModeEnabled,
            ForceApiVersionMismatch = source.ForceApiVersionMismatch,
            ForceCapabilityMismatch = source.ForceCapabilityMismatch,
            ForceApiUnavailable = source.ForceApiUnavailable,
            ForceMediaMissing = source.ForceMediaMissing,
            ForceSseDisconnect = source.ForceSseDisconnect,
            LastUpdatedUtc = source.LastUpdatedUtc
        };
    }
}
