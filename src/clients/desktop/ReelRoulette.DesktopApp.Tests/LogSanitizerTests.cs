using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LogSanitizerTests
{
    [Theory]
    [InlineData("MediaPlayer.VolumeChanged: LibVLC reports volume 0.60 - HasCurrent: True, AppMuted: False")]
    [InlineData("Checking for desktop updates (channel=dev, feed=https://github.com/owner/ReelRoulette/releases/download/v0.14.0-dev.2, current=0.14.0-dev.2).")]
    [InlineData("CoreServerProbe: /api/version success (api=1, app=0.14.0-dev.2, assets=n/a)")]
    [InlineData("Pairing: POST /control/pair accepted")]
    [InlineData("ReapplyAudioState: Reapplying (playing) - HasCurrent: True, PlayerMute: False, PlayerVolume: 60, AppMuted: False, UserVolume: 60")]
    public void Sanitize_LeavesNumbersHostsVersionsAndRoutesAlone(string message)
    {
        Assert.Equal(message, LogSanitizer.Sanitize(message));
    }

    [Theory]
    [InlineData("MediaPlayer.VolumeChanged: LibVLC reports volume 0.60 - Current: 102 Reef Blower.avi, AppMuted: False", "AppMuted: False")]
    [InlineData("Playing /mnt/nas/multimedia/TV/Show/102 Reef Blower.avi now", "Playing ")]
    [InlineData("status=SSE connected currentId=/mnt/nas/multimedia/TV/Show/102 Reef Blower.avi, attempt=1", "attempt=1")]
    [InlineData("Settings saved to /home/someone/.config/ReelRoulette/desktop-settings.json", "Settings saved to ")]
    [InlineData(@"Opened D:\Media\TV\102 Reef Blower.avi", "Opened ")]
    public void Sanitize_RedactsMediaFileNamesAndPaths(string message, string kept)
    {
        var sanitized = LogSanitizer.Sanitize(message);

        Assert.DoesNotContain("Reef", sanitized);
        Assert.DoesNotContain("Blower", sanitized);
        Assert.DoesNotContain("/mnt", sanitized);
        Assert.DoesNotContain("/home", sanitized);
        Assert.DoesNotContain("Media", sanitized.Replace("MediaPlayer", ""));
        Assert.Contains(kept, sanitized);
    }

    [Theory]
    [InlineData("Show.Name.S01E02.mkv")]
    [InlineData("Bob's Trip (2010), Part 2.MP4")]
    [InlineData("holiday photo.jpeg")]
    public void Sanitize_RedactsWholeMediaFileNames(string fileName)
    {
        var sanitized = LogSanitizer.Sanitize($"Now playing: {fileName}");

        Assert.Equal("Now playing: [redacted-file]", sanitized);
    }
}
