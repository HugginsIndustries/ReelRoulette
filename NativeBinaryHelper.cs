using System;
using System.IO;
using System.Runtime.InteropServices;

namespace ReelRoulette
{
    public static class NativeBinaryHelper
    {
        private static string? _cachedFFprobePath;
        private static string? _cachedLibVlcPath;
        private static readonly object _ffprobePathLock = new object();
        private static readonly object _libVlcPathLock = new object();

        public static string GetFFprobePath()
        {
            if (_cachedFFprobePath != null)
                return _cachedFFprobePath;

            lock (_ffprobePathLock)
            {
                if (_cachedFFprobePath != null)
                    return _cachedFFprobePath;

                var exeDir = AppContext.BaseDirectory;
                var rid = GetRuntimeIdentifier();
                
                if (string.IsNullOrEmpty(rid))
                {
                    _cachedFFprobePath = "";
                    return "";
                }
                
                var exeName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffprobe.exe" : "ffprobe";
                var path = Path.Combine(exeDir, "runtimes", rid, "native", exeName);
                
                _cachedFFprobePath = File.Exists(path) ? path : "";
                return _cachedFFprobePath;
            }
        }
        
        public static string GetLibVlcPath()
        {
            if (_cachedLibVlcPath != null)
                return _cachedLibVlcPath;

            lock (_libVlcPathLock)
            {
                if (_cachedLibVlcPath != null)
                    return _cachedLibVlcPath;

                var exeDir = AppContext.BaseDirectory;
                var rid = GetRuntimeIdentifier();
                
                if (string.IsNullOrEmpty(rid))
                {
                    _cachedLibVlcPath = "";
                    return "";
                }
                
                var libVlcDir = Path.Combine(exeDir, "runtimes", rid, "native", "libvlc");
                
                _cachedLibVlcPath = Directory.Exists(libVlcDir) ? libVlcDir : "";
                return _cachedLibVlcPath;
            }
        }
        
        private static string GetRuntimeIdentifier()
        {
            return RuntimeInformation.ProcessArchitecture switch
            {
                Architecture.X64 => RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "win-x64" :
                                  RuntimeInformation.IsOSPlatform(OSPlatform.Linux) ? "linux-x64" :
                                  RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "osx-x64" : "",
                Architecture.Arm64 => RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "osx-arm64" : "",
                _ => ""
            };
        }
    }
}

