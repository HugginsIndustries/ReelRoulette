using System;
using System.Reflection;
using Velopack;

namespace ReelRoulette;

internal static class DesktopRunningVersion
{
    internal static string Resolve(UpdateManager manager)
    {
        if (manager.IsInstalled)
        {
            return manager.CurrentVersion?.ToString() ?? "unknown";
        }

        return ResolveFromEntryAssembly();
    }

    internal static string ResolveFromEntryAssembly()
    {
        var assembly = Assembly.GetEntryAssembly();
        var assemblyVersion = assembly?.GetName().Version?.ToString();
        var informational = assembly?
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion;

        if (!string.IsNullOrWhiteSpace(informational))
        {
            var displayInformational = informational.Split('+')[0].Trim();
            if (!string.IsNullOrWhiteSpace(displayInformational) &&
                !string.Equals(displayInformational, assemblyVersion, StringComparison.OrdinalIgnoreCase))
            {
                return displayInformational;
            }
        }

        return assemblyVersion ?? "unknown";
    }

    internal static string FormatRunningVersionLine(string? runningVersion, bool velopackInstalled)
    {
        var version = string.IsNullOrWhiteSpace(runningVersion) ? "unknown" : runningVersion;
        if (velopackInstalled)
        {
            return $"Running version: {version}";
        }

        return $"Running version: {version} (dev run — not a Velopack install)";
    }
}
