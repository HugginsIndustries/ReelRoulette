namespace ReelRoulette;

/// <summary>
/// Decides when the desktop reapplies volume and mute to a newly started video.
/// LibVLC creates a new audio output only after playback starts, so values set before that can be lost.
/// Each new media is reapplied once when it starts playing and once when its playback time first advances.
/// A later Playing event, such as resume from pause, does not reapply.
/// </summary>
public sealed class PlaybackAudioReapply
{
    private enum Stage
    {
        Idle,
        AwaitingPlaying,
        AwaitingTimeAdvance
    }

    private Stage _stage = Stage.Idle;
    private long _playingTimeMs;

    /// <summary>Arms the reapply for a media that is about to start.</summary>
    public void BeginMedia()
    {
        _stage = Stage.AwaitingPlaying;
        _playingTimeMs = 0;
    }

    /// <summary>Disarms the reapply, for example when a photo replaces the video.</summary>
    public void Clear()
    {
        _stage = Stage.Idle;
        _playingTimeMs = 0;
    }

    /// <summary>Returns true when this Playing event is the first one for the current media.</summary>
    public bool OnPlaying(long timeMs)
    {
        if (_stage != Stage.AwaitingPlaying)
        {
            return false;
        }

        _stage = Stage.AwaitingTimeAdvance;
        _playingTimeMs = timeMs;
        return true;
    }

    /// <summary>Returns true on the first tick after Playing where the playback time has advanced.</summary>
    public bool OnTick(long timeMs)
    {
        if (_stage != Stage.AwaitingTimeAdvance || timeMs <= _playingTimeMs)
        {
            return false;
        }

        _stage = Stage.Idle;
        return true;
    }
}
