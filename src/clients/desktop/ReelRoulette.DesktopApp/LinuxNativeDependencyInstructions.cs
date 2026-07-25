using System;
using System.Collections.Generic;
using System.IO;

namespace ReelRoulette;

/// <summary>
/// Maps Linux distro identity (<c>/etc/os-release</c>) to copy-paste install commands for FFmpeg and VLC/LibVLC.
/// Add new distros by extending the family matchers below.
/// </summary>
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
        fields.TryGetValue("VERSION_ID", out var versionIdRaw);

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
            var command = BuildOpenSuseInstallCommand(id, versionIdRaw);
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
            "sudo dnf install vlc ffmpeg");
    }

    private static string BuildOpenSuseInstallCommand(string id, string? versionIdRaw)
    {
        var versionId = Unquote(versionIdRaw)?.Trim() ?? string.Empty;
        var isTumbleweed = id.Contains("tumbleweed", StringComparison.OrdinalIgnoreCase);

        var repoUrl = isTumbleweed
            ? "https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Tumbleweed/"
            : $"https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Leap_{versionId}/";

        return string.Join(
            '\n',
            $"sudo zypper addrepo -cfp 90 {repoUrl} packman",
            "sudo zypper refresh",
            "sudo zypper install --allow-vendor-change --from packman ffmpeg vlc vlc-codecs");
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
