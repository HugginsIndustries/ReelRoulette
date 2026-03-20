using System.Globalization;

namespace ReelRoulette.Core.Storage;

/// <summary>
/// Shared backup filename timestamp formatting for desktop and core JSON backups.
/// </summary>
public static class BackupFileNaming
{
    /// <summary>
    /// Builds a filesystem-safe timestamp suffix: local wall-clock time plus UTC offset (no colons).
    /// Examples: <c>2026-03-14_15-10-30_p0900</c> (UTC+9), <c>2026-03-14_06-30-00_m0800</c> (UTC-8).
    /// </summary>
    public static string FormatNowForBackupSuffix()
        => FormatForBackupSuffix(DateTimeOffset.Now);

    public static string FormatForBackupSuffix(DateTimeOffset when)
    {
        var stamp = when.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture);
        var totalMinutes = (int)when.Offset.TotalMinutes;
        var sign = totalMinutes >= 0 ? "p" : "m";
        var abs = Math.Abs(totalMinutes);
        var h = abs / 60;
        var m = abs % 60;
        return $"{stamp}_{sign}{h:D2}{m:D2}";
    }

    /// <summary>
    /// Best-effort instant (UTC) for ordering backups and enforcing minimum gap; prefers creation UTC, then last-write UTC.
    /// </summary>
    public static DateTime GetFileOrderingUtcTimestamp(FileInfo file)
    {
        var creationUtc = file.CreationTimeUtc;
        var lastWriteUtc = file.LastWriteTimeUtc;
        if (creationUtc == DateTime.MinValue)
        {
            return lastWriteUtc;
        }

        if (lastWriteUtc == DateTime.MinValue)
        {
            return creationUtc;
        }

        return creationUtc >= lastWriteUtc ? creationUtc : lastWriteUtc;
    }
}
