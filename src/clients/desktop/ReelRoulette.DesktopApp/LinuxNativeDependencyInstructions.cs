using System;
using System.Collections.Generic;
using System.IO;

namespace ReelRoulette;

/// <summary>
/// Maps Linux distro identity (<c>/etc/os-release</c>) to copy-paste install commands for FFmpeg and VLC/LibVLC.
/// </summary>
/// <remarks>
/// LibVLCSharp loads the native library by its unversioned name (<c>libvlc.so</c>). A working VLC player install is not
/// enough on distros that ship only <c>libvlc.so.5</c> unless a separate package provides the bare symlink. When adding
/// a new family, include whatever package supplies <c>libvlc.so</c> (verify on the target system: <c>libvlc.so</c> must
/// exist alongside <c>libvlc.so.5</c>). Extend the family matchers below.
/// </remarks>
public static class LinuxNativeDependencyInstructions
{
    public sealed record Instructions(
        bool HasInstallCommand,
        string? DistroHeading,
        string Message,
        string? CopyCommand);

    private const string GenericMessage =
        "ReelRoulette needs FFmpeg (including ffprobe) for the server and VLC/LibVLC for desktop video playback. " +
        "Linux packages do not bundle these tools.\n\n" +
        "Install FFmpeg and VLC/LibVLC using your distribution's package manager. On some distributions the LibVLC " +
        "development package (which provides the libvlc.so symlink) is separate from the VLC player package — " +
        "install both if playback fails after installing vlc alone.";

    private const string DebianInstallCommand =
        "sudo apt update && sudo apt install -y ffmpeg vlc libvlc-dev";

    private const string ArchInstallCommand =
        "sudo pacman -S --needed ffmpeg vlc";

    public static Instructions ResolveFromSystem()
    {
        try
        {
            var path = "/etc/os-release";
            if (!File.Exists(path))
            {
                return ResolveFromOsReleaseContent(null);
            }

            var content = File.ReadAllText(path);
            return ResolveFromOsReleaseContent(content);
        }
        catch
        {
            return ResolveFromOsReleaseContent(null);
        }
    }

    public static Instructions ResolveFromOsReleaseContent(string? osReleaseContent)
    {
        if (string.IsNullOrWhiteSpace(osReleaseContent))
        {
            return new Instructions(
                HasInstallCommand: false,
                DistroHeading: null,
                Message: GenericMessage,
                CopyCommand: null);
        }

        var fields = ParseOsRelease(osReleaseContent);
        fields.TryGetValue("ID", out var idRaw);
        fields.TryGetValue("ID_LIKE", out var idLikeRaw);
        fields.TryGetValue("NAME", out var nameRaw);
        fields.TryGetValue("PRETTY_NAME", out var prettyNameRaw);

        var id = NormalizeToken(idRaw);
        var idLike = NormalizeToken(idLikeRaw);
        var displayName = ResolveDisplayName(nameRaw, prettyNameRaw);

        if (IsDebianLike(id, idLike))
        {
            return WithCommand(displayName, DebianInstallCommand);
        }

        if (IsArchLike(id, idLike))
        {
            return WithCommand(displayName, ArchInstallCommand);
        }

        if (IsFedoraLike(id, idLike))
        {
            var command = BuildFedoraInstallCommand();
            return WithCommand(displayName, command);
        }

        if (IsOpenSuseLike(id, idLike))
        {
            var command = BuildOpenSuseInstallCommand(id);
            return WithCommand(displayName, command);
        }

        return new Instructions(
            HasInstallCommand: false,
            DistroHeading: null,
            Message: GenericMessage,
            CopyCommand: null);
    }

    private static Instructions WithCommand(string displayName, string command)
    {
        var heading = $"Instructions for {displayName}:";
        const string intro =
            "VLC/LibVLC is required for desktop video playback and was not found on this system. " +
            "Install the packages below (they include FFmpeg/ffprobe for the server as well), then restart ReelRoulette.";

        return new Instructions(
            HasInstallCommand: true,
            DistroHeading: heading,
            Message: intro,
            CopyCommand: command);
    }

    private static string BuildFedoraInstallCommand()
    {
        return string.Join(
            '\n',
            "sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm",
            "sudo dnf swap ffmpeg-free ffmpeg --allowerasing",
            // vlc-devel provides the unversioned libvlc.so LibVLCSharp resolves by name (verified on clean Fedora 43).
            "sudo dnf install vlc vlc-devel ffmpeg");
    }

    private static string BuildOpenSuseInstallCommand(string id)
    {
        var isTumbleweed = id.Contains("tumbleweed", StringComparison.OrdinalIgnoreCase);

        var addRepoLine = isTumbleweed
            ? "sudo zypper addrepo -cfp 90 https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Tumbleweed/ packman"
            // Single quotes are load-bearing: bash must not expand $releasever before zypper sees it (otherwise openSUSE_Leap_/).
            // Zypper stores $releasever in /etc/zypp/repos.d/ and re-expands it on every refresh, so the repo follows Leap upgrades instead of staying pinned to an old release.
            : "sudo zypper addrepo -cfp 90 'https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Leap_$releasever/' packman";

        return string.Join(
            '\n',
            addRepoLine,
            "sudo zypper refresh",
            // ffmpeg is a capability name on Leap (zypper resolves to the current major, e.g. ffmpeg-8); do not pin a version.
            // vlc-devel from Packman provides /usr/lib64/libvlc.so (verified on clean openSUSE Leap 16.0); keep vendor-consistent with Packman libvlc.
            "sudo zypper install --allow-vendor-change --from packman ffmpeg vlc vlc-codecs vlc-devel");
    }

    private static bool IsDebianLike(string id, string idLike)
    {
        if (IdEquals(id, "debian", "ubuntu", "linuxmint", "pop"))
        {
            return true;
        }

        return IdLikeContains(idLike, "debian") || IdLikeContains(idLike, "ubuntu");
    }

    private static bool IsArchLike(string id, string idLike)
    {
        if (IdEquals(id, "arch", "cachyos", "manjaro", "endeavouros"))
        {
            return true;
        }

        return IdLikeContains(idLike, "arch");
    }

    private static bool IsFedoraLike(string id, string idLike)
    {
        if (IdEquals(id, "fedora"))
        {
            return true;
        }

        return IdLikeContains(idLike, "fedora");
    }

    private static bool IsOpenSuseLike(string id, string idLike)
    {
        if (IdEquals(id, "opensuse-tumbleweed", "opensuse-leap", "opensuse", "sles"))
        {
            return true;
        }

        if (id.StartsWith("opensuse", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return IdLikeContains(idLike, "suse");
    }

    private static bool IdEquals(string id, params string[] candidates)
    {
        foreach (var candidate in candidates)
        {
            if (string.Equals(id, candidate, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IdLikeContains(string idLike, string token)
    {
        if (string.IsNullOrWhiteSpace(idLike))
        {
            return false;
        }

        foreach (var part in idLike.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (string.Equals(part, token, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public static Dictionary<string, string> ParseOsRelease(string content)
    {
        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in content.Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed[0] == '#')
            {
                continue;
            }

            var equalsIndex = trimmed.IndexOf('=');
            if (equalsIndex <= 0)
            {
                continue;
            }

            var key = trimmed[..equalsIndex].Trim();
            var value = Unquote(trimmed[(equalsIndex + 1)..].Trim()) ?? string.Empty;
            fields[key] = value;
        }

        return fields;
    }

    private static string ResolveDisplayName(string? name, string? prettyName)
    {
        var fromName = Unquote(name);
        if (!string.IsNullOrWhiteSpace(fromName))
        {
            return fromName!;
        }

        var fromPretty = Unquote(prettyName);
        if (!string.IsNullOrWhiteSpace(fromPretty))
        {
            return fromPretty!;
        }

        return "Linux";
    }

    private static string NormalizeToken(string? value)
    {
        return Unquote(value)?.Trim().ToLowerInvariant() ?? string.Empty;
    }

    private static string? Unquote(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        if (value.Length >= 2 && value[0] == '"' && value[^1] == '"')
        {
            return value[1..^1];
        }

        return value;
    }
}
