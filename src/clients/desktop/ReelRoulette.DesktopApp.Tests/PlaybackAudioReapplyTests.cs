using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class PlaybackAudioReapplyTests
{
    [Fact]
    public void NewMedia_ReappliesOnPlayingAndOnFirstTimeAdvance()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();

        Assert.True(reapply.OnPlaying(0));
        Assert.False(reapply.OnTick(0));
        Assert.True(reapply.OnTick(200));
        Assert.False(reapply.OnTick(400));
    }

    [Fact]
    public void ResumeFromPause_DoesNotReapply()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();
        Assert.True(reapply.OnPlaying(0));
        Assert.True(reapply.OnTick(200));

        // Pause then resume raises Playing again for the same media.
        Assert.False(reapply.OnPlaying(1000));
        Assert.False(reapply.OnTick(1200));
    }

    [Fact]
    public void ResumeBeforeTimeAdvanced_ReappliesOnlyOnTheAdvance()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();
        Assert.True(reapply.OnPlaying(0));

        Assert.False(reapply.OnPlaying(0));
        Assert.True(reapply.OnTick(200));
    }

    [Fact]
    public void TicksBeforePlaying_DoNotReapply()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();

        Assert.False(reapply.OnTick(200));
        Assert.True(reapply.OnPlaying(200));
        Assert.False(reapply.OnTick(200));
        Assert.True(reapply.OnTick(400));
    }

    [Fact]
    public void WithoutNewMedia_NothingReapplies()
    {
        var reapply = new PlaybackAudioReapply();

        Assert.False(reapply.OnPlaying(0));
        Assert.False(reapply.OnTick(200));
    }

    [Fact]
    public void Clear_DisarmsPendingReapply()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();
        reapply.Clear();

        Assert.False(reapply.OnPlaying(0));
        Assert.False(reapply.OnTick(200));
    }

    [Fact]
    public void EachNewMedia_ArmsAgain()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();
        Assert.True(reapply.OnPlaying(0));
        Assert.True(reapply.OnTick(200));

        reapply.BeginMedia();
        Assert.True(reapply.OnPlaying(5000));
        Assert.False(reapply.OnTick(5000));
        Assert.True(reapply.OnTick(5200));
    }

    [Fact]
    public void NewMediaBeforeTimeAdvanced_RestartsFromPlaying()
    {
        var reapply = new PlaybackAudioReapply();
        reapply.BeginMedia();
        Assert.True(reapply.OnPlaying(0));

        // Next pressed before the first video's time advanced.
        reapply.BeginMedia();
        Assert.False(reapply.OnTick(200));
        Assert.True(reapply.OnPlaying(0));
        Assert.True(reapply.OnTick(200));
    }
}
