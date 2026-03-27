using System;
using ReelRoulette.Core.Fingerprints;

namespace ReelRoulette
{
    public class FileFingerprintResult
    {
        public string? Fingerprint { get; set; }
        public long FileSizeBytes { get; set; }
        public DateTime LastWriteTimeUtc { get; set; }
        public bool IsStableRead { get; set; }
        public string? Error { get; set; }
    }

    public class FileFingerprintService
    {
        private readonly ReelRoulette.Core.Fingerprints.FileFingerprintService _core = new();

        public FileFingerprintResult ComputeFingerprint(string fullPath)
        {
            var result = _core.ComputeFingerprint(fullPath);
            return new FileFingerprintResult
            {
                Fingerprint = result.Fingerprint,
                FileSizeBytes = result.FileSizeBytes,
                LastWriteTimeUtc = result.LastWriteTimeUtc,
                IsStableRead = result.IsStableRead,
                Error = result.Error
            };
        }
    }
}
