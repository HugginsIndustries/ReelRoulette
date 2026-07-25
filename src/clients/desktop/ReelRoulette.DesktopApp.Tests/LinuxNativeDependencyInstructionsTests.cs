using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LinuxNativeDependencyInstructionsTests
{
    private const string LinuxMintOsRelease = """
        NAME="Linux Mint"
        VERSION="22.1 (Xia)"
        ID=linuxmint
        ID_LIKE="ubuntu debian"
        PRETTY_NAME="Linux Mint 22.1"
        VERSION_ID="22.1"
        """;

    private const string ArchDerivativeOsRelease = """
        NAME="Custom Arch Spin"
        ID=customarchspin
        ID_LIKE=arch
        PRETTY_NAME="Custom Arch Spin"
        """;

    private const string FedoraOsRelease = """
        NAME="Fedora Linux"
        VERSION="41 (Workstation Edition)"
        ID=fedora
        VERSION_ID=41
        PRETTY_NAME="Fedora Linux 41 (Workstation Edition)"
        """;

    private const string SlackwareOsRelease = """
        NAME="Slackware"
        ID=slackware
        VERSION_ID="15.0"
        PRETTY_NAME="Slackware 15.0"
        """;

    [Fact]
    public void ResolveFromOsReleaseContent_LinuxMintIdMatch_EmitsAptCommandWithHeading()
    {
        var result = LinuxNativeDependencyInstructions.ResolveFromOsReleaseContent(LinuxMintOsRelease);

        Assert.True(result.HasInstallCommand);
        Assert.Equal("Instructions for Linux Mint:", result.DistroHeading);
        Assert.Equal("sudo apt update && sudo apt install -y ffmpeg vlc libvlc-dev", result.CopyCommand);
        Assert.Contains("libvlc-dev", result.CopyCommand, StringComparison.Ordinal);
    }

    [Fact]
    public void ResolveFromOsReleaseContent_IdLikeArchFallback_EmitsPacmanCommand()
    {
        var result = LinuxNativeDependencyInstructions.ResolveFromOsReleaseContent(ArchDerivativeOsRelease);

        Assert.True(result.HasInstallCommand);
        Assert.Equal("Instructions for Custom Arch Spin:", result.DistroHeading);
        Assert.Equal("sudo pacman -S --needed ffmpeg vlc", result.CopyCommand);
    }

    [Fact]
    public void ResolveFromOsReleaseContent_Fedora_EmitsMultiLineRpmFusionSequence()
    {
        var result = LinuxNativeDependencyInstructions.ResolveFromOsReleaseContent(FedoraOsRelease);

        Assert.True(result.HasInstallCommand);
        Assert.Equal("Instructions for Fedora Linux:", result.DistroHeading);
        Assert.NotNull(result.CopyCommand);
        Assert.Contains("rpmfusion-free-release", result.CopyCommand, StringComparison.Ordinal);
        Assert.Contains("ffmpeg-free ffmpeg --allowerasing", result.CopyCommand, StringComparison.Ordinal);
        Assert.Contains("sudo dnf install vlc ffmpeg", result.CopyCommand, StringComparison.Ordinal);
        Assert.Equal(3, result.CopyCommand!.Split('\n').Length);
    }

    [Fact]
    public void ResolveFromOsReleaseContent_UnknownDistro_EmitsGenericMessageWithoutHeading()
    {
        var result = LinuxNativeDependencyInstructions.ResolveFromOsReleaseContent(SlackwareOsRelease);

        Assert.False(result.HasInstallCommand);
        Assert.Null(result.DistroHeading);
        Assert.Null(result.CopyCommand);
        Assert.Contains("FFmpeg", result.Message, StringComparison.Ordinal);
        Assert.Contains("package manager", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ParseOsRelease_StripsQuotesFromValues()
    {
        var fields = LinuxNativeDependencyInstructions.ParseOsRelease(LinuxMintOsRelease);

        Assert.Equal("Linux Mint", fields["NAME"]);
        Assert.Equal("linuxmint", fields["ID"]);
        Assert.Equal("ubuntu debian", fields["ID_LIKE"]);
    }
}
