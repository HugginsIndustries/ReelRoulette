using System.Reflection;
using Velopack;

namespace ReelRoulette.ServerApp.Hosting;

internal static class ServerRunningVersion
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
}
