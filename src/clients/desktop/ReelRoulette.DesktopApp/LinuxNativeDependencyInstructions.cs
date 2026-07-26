using System;
using System.Collections.Generic;
using System.IO;

namespace ReelRoulette;

/// <summary>
/// Maps Linux distro identity (<c>/etc/os-release</c>) to copy-paste install commands for FFmpeg and VLC/LibVLC.
/// </summary>
/// <remarks>
/// The desktop app resolves LibVLC via a Linux-only <c>DllImport</c> resolver (versioned soname such as
/// <c>libvlc.so.5</c>, then <c>libvlc.so</c> as fallback). Install VLC libraries and plugins only — not the
/// full media player metapackage (<c>vlc</c> GUI/binary) where the distro splits packages. Do not add development
/// packages (<c>libvlc-dev</c>, <c>vlc-devel</c>, etc.). Commands combine desktop LibVLC and server FFmpeg needs.
/// </remarks>
public static class LinuxNativeDependencyInstructions
{
    public sealed record Instructions(
        bool HasInstallCommand,
        string? DistroHeading,
        string Message,
        string? CopyCommand);

    private const string GenericMessage =
        "ReelRoulette needs FFmpeg (including ffprobe) for the server and LibVLC libraries/plugins for desktop video playback. " +
        "Linux packages do not bundle these tools.\n\n" +
        "Install the packages below using your distribution's package manager, then restart ReelRoulette.";

    private const string DebianInstallCommand =
        "sudo apt update && sudo apt install -y ffmpeg libvlc5 vlc-plugin-base vlc-plugin-video-output";

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
            "sudo dnf install vlc-libs vlc-plugins-base vlc-plugins-video-out vlc-plugin-ffmpeg vlc-plugin-pipewire ffmpeg");
    }

    private static string BuildOpenSuseInstallCommand(string id)
    {
        var isTumbleweed = id.Contains("tumbleweed", StringComparison.OrdinalIgnoreCase);

        // Packman Essentials (not the full Packman repo): vendor-switches codec libraries VLC's ffmpeg plugin
        // links against, without pulling in Mesa vendor switches from a full-repo dup.
        var addRepoLine = isTumbleweed
            // NOT verified on a real Tumbleweed system (Leap 16.0 Essentials flow was verified end-to-end).
            ? "sudo zypper addrepo -cfp 90 https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Tumbleweed/Essentials/ packman-essentials"
            // Single quotes are load-bearing: bash must not expand $releasever before zypper sees it.
            : "sudo zypper addrepo -cfp 90 'https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Leap_$releasever/Essentials/' packman-essentials";

        return string.Join(
            '\n',
            addRepoLine,
            "sudo zypper refresh",
            // Required (verified on Leap 16): dup upgrades already-installed libavcodec/etc. so VLC's plugin loads
            // the same library line. Targeted installs of versioned names (e.g. libavcodec61) go stale on Leap upgrades.
            "sudo zypper dup --from packman-essentials --allow-vendor-change",
            // dup does not install ffmpeg/ffprobe binaries; server refresh needs them on PATH (verified after dup alone).
            "sudo zypper install --from packman-essentials ffmpeg");
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
