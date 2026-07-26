using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using LibVLCSharp.Shared;

namespace ReelRoulette;

/// <summary>
/// On Linux, LibVLCSharp resolves <c>[DllImport("libvlc")]</c> to unversioned names only; runtime VLC packages
/// often ship <c>libvlc.so.5</c> without a <c>libvlc.so</c> symlink. Map that import to the versioned soname.
/// </summary>
internal static class LinuxLibVlcNativeResolver
{
    private static int _registered;

    internal static void EnsureRegistered()
    {
        if (!OperatingSystem.IsLinux())
        {
            return;
        }

        if (Interlocked.Exchange(ref _registered, 1) != 0)
        {
            return;
        }

        NativeLibrary.SetDllImportResolver(typeof(LibVLC).Assembly, Resolve);
    }

    private static IntPtr Resolve(string libraryName, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (!string.Equals(libraryName, "libvlc", StringComparison.Ordinal))
        {
            return IntPtr.Zero;
        }

        ReadOnlySpan<string> candidates = ["libvlc.so.5", "libvlc.so"];
        foreach (var candidate in candidates)
        {
            if (NativeLibrary.TryLoad(candidate, out var handle))
            {
                return handle;
            }
        }

        return IntPtr.Zero;
    }
}
