using System.Security.Cryptography;

namespace ReelRoulette.Core.Fingerprints;

public sealed class FileFingerprintResult
{
    public string? Fingerprint { get; set; }
    public long FileSizeBytes { get; set; }
    public DateTime LastWriteTimeUtc { get; set; }
    public bool IsStableRead { get; set; }
    public string? Error { get; set; }
}

public sealed class FileFingerprintService
{
    public FileFingerprintResult ComputeFingerprint(string fullPath)
    {
        try
        {
            if (!File.Exists(fullPath))
                return new FileFingerprintResult { Error = "File not found" };

            var before = new FileInfo(fullPath);
            var beforeSize = before.Length;
            var beforeWriteUtc = before.LastWriteTimeUtc;

            using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var sha = SHA256.Create();
            var hashBytes = sha.ComputeHash(stream);
            var hash = Convert.ToHexString(hashBytes).ToLowerInvariant();

            var after = new FileInfo(fullPath);
            var afterSize = after.Length;
            var afterWriteUtc = after.LastWriteTimeUtc;
            var stable = beforeSize == afterSize && beforeWriteUtc == afterWriteUtc;

            return new FileFingerprintResult
            {
                Fingerprint = hash,
                FileSizeBytes = afterSize,
                LastWriteTimeUtc = afterWriteUtc,
                IsStableRead = stable
            };
        }
        catch (Exception ex)
        {
            return new FileFingerprintResult { Error = ex.Message };
        }
    }
}
